import React, { Component, RaisedButton } from "react";
import { Button, Alert, Progress } from 'reactstrap';
const { ipcRenderer } = require("electron");
const { dialog } = require('electron').remote;
import Select from 'react-select';

export default class extends Component {

    constructor(props) {
        super(props);

        console.log('firmware:constructor');

        this.state = {
            file: null,
            port: "",
            ports: [],
            erase: 0,
            write: 0,
            verify: 0,
            error: null,
            done: false,
            isRun: false,
            list: [],
            firmware: null,
            download: 0,
            version: null
        };

        this.ipcProgressUpdate = this.ipcProgressUpdate.bind(this);
        this.ipcPortsUpdate = this.ipcPortsUpdate.bind(this);
        this.ipcError = this.ipcError.bind(this);
        this.ipcDone = this.ipcDone.bind(this);
        this.openDialogBin = this.openDialogBin.bind(this);
        this.flash = this.flash.bind(this);
        this.ipcList = this.ipcList.bind(this);
        this.ipcDownload = this.ipcDownload.bind(this);
        this.formFirmwareSelectOnChange = this.formFirmwareSelectOnChange.bind(this);
        this.formVersionSelectOnChange = this.formVersionSelectOnChange.bind(this);
    }

    componentDidMount() {
        console.log('firmware:componentDidMount');

        ipcRenderer.addListener("firmware:progress", this.ipcProgressUpdate);

        ipcRenderer.addListener("firmware:port-list", this.ipcPortsUpdate);

        ipcRenderer.addListener("firmware:error", this.ipcError);

        ipcRenderer.addListener("firmware:done", this.ipcDone);

        ipcRenderer.addListener("firmware:list", this.ipcList);

        ipcRenderer.addListener("firmware:download", this.ipcDownload);

        ipcRenderer.send("firmware:get-port-list");

        ipcRenderer.send("firmware:get-list");
    }

    componentWillUnmount() {
        console.log('firmware:componentWillUnmount');

        ipcRenderer.removeListener("firmware:progress", this.ipcProgressUpdate);

        ipcRenderer.removeListener("firmware:port-list", this.ipcPortsUpdate);

        ipcRenderer.removeListener("firmware:error", this.ipcError);

        ipcRenderer.removeListener("firmware:done", this.ipcDone);

        ipcRenderer.removeListener("firmware:list", this.ipcList);

        ipcRenderer.removeListener("firmware:download", this.ipcDownload);
    }

    ipcDownload(sender, payload) {
        this.setState({download: payload.percent});
    }

    ipcList(sender, list) {
        // console.log(list);
        this.setState({list});
    }

    ipcProgressUpdate(sender, payload) {
        this.setState(payload);
    }

    ipcPortsUpdate(sender, ports) {

        console.log('ipcPortsUpdate',  ports);

        this.setState({ports:ports});

        if ((this.state.port === "") && (ports.length > 0)) {
            this.setState({port:ports[0].comName});
        }
    }

    ipcError(sender, error) {
        this.setState({error: error, isRun: false});
    }

    ipcDone(sender, payload) {
        this.setState({done: true, isRun: false});
    }

    openDialogBin(e) {
        e.preventDefault();
        e.stopPropagation();

        dialog.showOpenDialog({properties: ['openFile']}, function (file) {
            console.log(file);
            if (file !== undefined) {
                this.setState({ file: file[0] });
            }
        }.bind(this));
    }

    flash() {
        this.setState({ erase: 0, write: 0, verify: 0, error: null, done: false, isRun: true, download: 0 });

        ipcRenderer.send("firmware:run-flash", {firmware: this.state.firmware.name, version: this.state.version.name, file: this.state.file, port: this.state.port});
    }

    formFirmwareSelectOnChange(firmware) {
        this.setState({ firmware, version: {name: "latest"} });
    }

    formVersionSelectOnChange(version) {
        this.setState({ version });
    }

    render() {
        return (
            <div id="firmware">

    <div className="row">
        <div className="form-group col-10">
            <label htmlFor="formFirmwareSelect">Firmware</label>
            <Select
            labelKey="name"
            options={this.state.list}
            placeholder="Choose firmware ..."
            searchable={true}
            onChange={this.formFirmwareSelectOnChange}
            value={this.state.firmware}
            optionRenderer={(item, index)=>{
                return (<span> {item.name} </span>);
            }}
            />
        </div>

        <div className="form-group col-2">
            <label htmlFor="formFirmwareSelect">Version</label>
            <Select
                labelKey="name"
                placeholder="Choose version ..."
                options={this.state.firmware ? [{name: "latest"}, ...(this.state.firmware.versions)] : []}
                value={this.state.version}
                onChange={this.formVersionSelectOnChange}
                disabled={!this.state.firmware}
                clearable={false}
            />
        </div>
    </div>

    {/* <div className="form-group">
        <label htmlFor="formFileInput">Firmware</label>
        <button type="file" className="form-control-file" id="formFileInput" onClick={this.openDialogBin}>
            {(this.state.file ? this.state.file : "Choose File")}
        </button>
    </div> */}

<div className="row">
    <div className="col-3">
        <label>Device</label>

        <select className="form-control mb-2" id="formDeviceSelect" disabled={this.state.isRun} value={this.state.port} onChange={(e) => this.setState({ port: e.target.value })}>
            <option key={-1} value=""></option>
            {
                this.state.ports.map((port, index) => <option value={port.comName} key={index}>{port.comName}</option>)
            }
        </select>


        <Button color="danger" className="col-12" disabled={this.state.isRun || (!this.state.file && !this.state.firmware)} onClick={this.flash}>FLASH FIRMWARE</Button>
    </div>

    <div className="col-9">

    {this.state.download ?
    (<div className="row">
        <div className="col-2">
        <label>Download</label>
        </div>
        <div className="col-10">
            <Progress value={this.state.download} striped/>
        </div>
    </div>
    ): <label>&nbsp;</label>}

    <div className="row">
        <div className="col-2">
        <label>Erase</label>
        </div>
        <div className="col-10">
            <Progress value={this.state.erase} striped/>
        </div>
    </div>

    <div className="row">
        <div className="col-2">
        <label>Write</label>
        </div>
        <div className="col-10">
            <Progress value={this.state.write} striped/>
        </div>
    </div>

    <div className="row">
        <div className="col-2">
        <label>Verify</label>
        </div>
        <div className="col-10">
            <Progress value={this.state.verify} striped/>
        </div>
    </div>

    </div>
</div>

    {this.state.error ?
    <Alert color="danger">
        {this.state.error}
    </Alert> : null }

    {this.state.done ?
    <Alert color="success">
        Done
    </Alert> : null }

    {this.state.firmware ?
    <div className="row">

        <div className="form-group col-7">

            {this.state.firmware.description ? <div>
            <label>Description</label>
            <p>{this.state.firmware.description}</p>
            </div> : null }

            {this.state.firmware.article ? <div>
            <label>Article</label>
            <p><a href={this.state.firmware.article} target="_blank">{this.state.firmware.article}</a></p>
            </div> : null }

            {this.state.firmware.video ? <div>
            <label>Video</label>
            <p><a href={this.state.firmware.video} target="_blank">{this.state.firmware.video}</a></p>
            </div> : null }

            {this.state.firmware.repository ? <div>
            <label>Repository</label>
            <p><a href={this.state.firmware.repository} target="_blank">{this.state.firmware.repository}</a></p>
            </div> : null }

        </div>

        <div className="form-group col-5">
            {this.state.firmware.images ? <img style={{width: "100%"}} src={this.state.firmware.images[0].url} alt={this.state.firmware.images[0].title} /> : null}

            {this.state.firmware.video ? <div>
                <br />
                <iframe src="https://www.youtube.com/embed/6kU-_ldaGOw" frameBorder="0" allow="encrypted-media" allowFullScreen="1"></iframe>
            </div> : null}
        </div>

    </div> : null}


        </div>)
    }

}
