"use strict";

const SerialPort = require("serialport");
var mqtt = require("mqtt");
const { ipcMain, BrowserWindow } = require("electron");

const DefaultDevice = "/dev/ttyUSB0";
const DefaultMqttUrl = "mqtt://127.0.0.1:1883";

let gateway;
let windowList = [];
let devices = [];
let intervalCheck;

intervalCheck = setInterval(port_list, 1000);

const gateway_topics = [
  "/nodes/get",
  "/nodes/purge",
  "/nodes/add",
  "/nodes/remove",
  "/pairing-mode/start",
  "/pairing-mode/stop",
  "/alias/set",
  "/alias/remove"
];

class Gateway {
  constructor(device, mqttUrl, getStatus = (portStatus) => { }) {
    this.connected = false;
    this._name = null;
    this._alias = null;
    this._nodes = null;
    this._subscribes = [];

    this._ser = new SerialPort(device, {
      autoOpen: false,
      baudRate: 115200,
      parity: "none",
    });

    this._ser.on("open", function () {
      this.connected = true;
      getStatus(true)
      this._ser.flush(function () {
        this._ser.write("\n");
        this.write("/info/get");
      }.bind(this));
    }.bind(this));

    this._ser.on("close", () => {
      this.connected = false;
      console.log("Gateway odpojena");
      getStatus(false)
    });

    const parser = this._ser.pipe(new SerialPort.parsers.Readline({ delimiter: "\n" }));
    parser.on("data", this._device_readline.bind(this));

    this._ser.open();

    this._mqtt = mqtt.connect(mqttUrl);
    this._mqtt.on("connect", this._mqtt_on_connect.bind(this));
    this._mqtt.on("message", this._mqtt_on_message.bind(this));
    this._mqtt.on("disconnect", this._mqtt_on_disconnect.bind(this));
  }

  _mqtt_on_connect() {
    console.log("Gateway MQTT connect");
    this._mqtt.subscribe("gateway/all/info/get");
    for (let i in this._subscribes) {
      this._mqtt.subscribe(this._subscribes[i]);
    }
  }

  _mqtt_on_disconnect() {
    console.log("Gateway MQTT disconnect");
  }

  _mqtt_on_message(topic, message) {
    let payload = message.toString();
    console.log("Gateway MQTT message", topic, payload);

    payload = payload.length > 0 ? JSON.parse(message.toString()) : null;

    let t = topic.split("/");
    let typ = t.shift(0);
    if (typ == "gateway") {
      if (topic == "gateway/all/info/get") {
        this.write("/info/get");
        return;
      }

      if (t.shift(0) == this._name) {

        topic = "/" + t.join("/");

        if (topic == "/alias/set") {
          this._eeprom_alias_add(payload.id, payload.alias);
          return;

        } else if (topic == "/alias/remove") {
          this._eeprom_alias_remove(payload);
          return;
        }

        this.write(topic, payload);
      }

    } else if (typ == "node") {
      if (t[0] in this._alias.name) {
        t[0] = this._alias.name[t[0]]
      }
      console.log("test", t, payload);
      this.write(t.join("/"), payload);
    }
  }

  _device_readline(line) {
    console.log("Gateway device readline:", line)
    let msg;

    try {
        msg = JSON.parse(line);
    } catch (error) {
        console.error(error);
        return;
    }

    let topic = msg[0];
    let payload = msg[1];

    if (topic[0] == "/") {
      this._gateway_msg(topic, payload);
    } else if (topic[0] == "$") {
      this._sys_message(topic, payload);
    } else if (topic[0] == "#") {
      // log messages
    } else {

      let id = topic.substr(0, 12);
      topic = topic.substr(12);

      if (topic == "/info") {
        // auto rename from firemware name
        if (this._alias.id[id] == undefined) {
          let new_alias_base = payload["firmware"];

          if (new_alias_base.startsWith('generic-node')) {
            new_alias_base = "generic-node";
          }

          let new_alias = null;

          for (let i = 0; i < 32; i++) {
            new_alias = new_alias_base + ':' + i;
            if (!this._alias.name[new_alias]) {
              break;
            }
          }

          this._eeprom_alias_add(id, new_alias);
        }
      }

      let alias = id;

      if (id in this._alias.id) {
        alias = this._alias.id[id];
      }

      this.pub("node/" + alias + topic, payload);
    }
  }

  _gateway_msg(topic, payload) {

    if (topic == "/info") {
      if (payload["id"] == "000000000000") {
        this.write("/info/get");
        return;
      }
      let m = (payload["firmware"] + ":").match(/bcf-gateway-(.*?):/)
      if (!m) {
        return;
      }

      this._name = m[1];

      for (let i in gateway_topics) {
        this._subscribe("gateway/" + this._name + gateway_topics[i]);
      }

      if (this._nodes == null) {
        this._nodes = [];

        this.write("/nodes/get");
      }

    } else if (topic == "/nodes") {

      this._nodes = payload;

      if (this._alias == null) {
        this._alias = {
          id: {},
          name: {},
          rename: {}
        };
        this.write("$eeprom/alias/list", 0)
      }

      let nodes = [];

      for (let i in payload) {
        let id = payload[i];
        this._subscribe_node(id);
        nodes.push({ id: id, alias: this._alias.id[id] })
      }

      payload = nodes;

    } else if (topic == "/detach") {
      this._unsubscribe_node(payload);
      this._nodes.pop(payload);
      this._eeprom_alias_remove(payload);

    } else if (topic == "/attach") {
      this._nodes.push(payload);
      this._subscribe_node(payload);
    }

    if (this._name) {
      this.pub("gateway/" + this._name + topic, payload);
    }
  }

  _sys_message(topic, payload) {

    if (topic == "$eeprom/alias/add/ok") {
      let id = payload;
      let alias = this._alias.rename[id];

      this._alias.id[id] = alias;
      this._alias.name[alias] = id;

      this.pub("gateway/" + this._name + "/alias/set/ok", { id: id, alias: alias });

      delete this._alias.rename[id];
      return;
    } else if (topic == "$eeprom/alias/remove/ok") {
      let id = payload;
      if (this._alias.id[id]) {
        let alias = this._alias.id[id];
        delete this._alias.id[id];
        delete this._alias.name[alias];
      }
      this.pub("gateway/" + this._name + "/alias/remove/ok", id);
      return;
    }

    let m = topic.match(/\$eeprom\/alias\/list\/(\d+)/);
    if (m) {
      let cnt = 0;
      for (let key in payload) {
        cnt++;
        this._alias.id[key] = payload[key];
        this._alias.name[payload[key]] = key;
      }
      if (cnt == 8) {
        this.write("$eeprom/alias/list", parseInt(m[1]) + 1);
      } else {
        for (let i in this._nodes) {
          let id = this._nodes[i];
          this._subscribe_node(id);
        }
      }
    }
  }

  _subscribe_node(id) {
    this._subscribe("node/" + id + "/+/+/+/+");

    if (this._alias && (id in this._alias.id)) {
      this._subscribe("node/" + this._alias.id[id] + "/+/+/+/+");
    }
  }

  _unsubscribe_node(id) {
    this._unsubscribe("node/" + id + "/+/+/+/+");

    if (this._alias && (id in this._alias.id)) {
      this._unsubscribe("node/" + this._alias.id[id] + "/+/+/+/+");
    }
  }

  _subscribe(topic) {
    if (this._subscribes.indexOf(topic) == -1) {
      this._subscribes.push(topic);
      this._mqtt.subscribe(topic);
    }
  }

  _unsubscribe(topic) {
    let index = this._subscribes.indexOf(topic);
    if (index != -1) {
      this._subscribes.pop(topic);
      this._mqtt.unsubscribe(topic);
    }
  }

  _eeprom_alias_add(id, alias) {
    if (alias == "") alias = null;

    if (alias) {
      this._alias.rename[id] = alias;
      this.write('$eeprom/alias/add', { 'id': id, 'name': alias });
    } else {
      this._eeprom_alias_remove(id);
    }
  }

  _eeprom_alias_remove(id) {
    if (!this._alias.id[id]) return;
    this.write('$eeprom/alias/remove', id);
  }

  write(topic, payload = null, callback = null) {
    this._ser.write(JSON.stringify([topic, payload]) + "\n");
    this._ser.drain(callback);
  }

  pub(topic, payload) {
    this._mqtt.publish(topic, JSON.stringify(payload));
  }

}

function findWindow(id) {
  //BrowserWindow.getAllWindows()[0].webContents
  return BrowserWindow.getAllWindows().find((item) => item.webContents.id == id);
}

function setup(device = DefaultDevice, mqttUrl = DefaultMqttUrl, getStatus) {
  console.log("Setting up gateway")

  gateway = new Gateway(device, mqttUrl, getStatus);
}

function notifyAll(topic, data) {
  let newList = [];
  BrowserWindow.getAllWindows().forEach((view) => {
    try {
      view.webContents.send(topic, data);
    }
    catch (error) {
      // Window no longer exists
    }
  });
}

async function port_list() {
  let ports = []
  var all_ports = await SerialPort.list() || [];
  all_ports.forEach((port) => {
    if (port.manufacturer == "0403" || port.vendorId == "0403") {
      ports.push(port);
    }
  });
  console.log("Checking", windowList.length, all_ports.length);
  if (ports.length != devices.length) {
    devices = ports;
    notifyAll("gateway:list", devices);
  }
}

ipcMain.on("gateway:connect", (event, device) => {
  setup(device, DefaultMqttUrl, (portStatus) => {
        notifyAll("gateway:status", portStatus);
        console.log("notifying all gateway odpojena asi", portStatus, windowList.length);
    });

  notifyAll("gateway:status", gateway == null || !gateway.connected ? false : true);
  notifyAll("gateway:list", devices);
});

ipcMain.on("gateway:disconnect", (event, data) => {
  gateway = null;
  notifyAll("gateway:status", gateway == null || !gateway.connected ? false : true)
});

ipcMain.on("gateway:status", (event, data) => {
  notifyAll("gateway:status", gateway == null ? false : gateway.connected);
  notifyAll("gateway:list", devices);
});

// Take reference for window to send async requests
/*
ipcMain.on("gateway:window:subscribe", (event, data) => {
  var window = findWindow(event.sender.id);
  if (window == null) {
    windowList.push(event.sender);
  }
  if (windowList.length == 1) {
    intervalCheck = setInterval(port_list, 250);
  }
})

// Take off reference for window to send async requests
ipcMain.on("gateway:window:unsubscribe", (event, data) => {
  var window = findWindow(event.sender.id);
  console.log("Odstranovani");
  if (window != null) {
    var index = windowList.indexOf(window);
    if (index > -1) {
      console.log("Odstranovani");
      windowList.splice(index, 1);
    }
  }
  if (windowList.length == 0) {
    clearInterval(intervalCheck);
  }
  console.log(windowList.length);
})
*/
module.exports = { setup, Gateway }
