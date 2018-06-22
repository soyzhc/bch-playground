import React from "react";
import { HashRouter, Route, Switch, NavLink } from "react-router-dom";
import { ipcRenderer } from "electron";

import Home from "./components/Home";
import NodeRED from "./components/NodeRED";
import Dashboard from "./components/Dashboard";
import MqttLog from "./components/MqttLog";
import Settings from "./components/Settings";
import HintBar from "./components/HintBar";
import RadioManager from "./components/RadioManager";
import Navbar from "./components/Navbar";

// Import SCSS
import "../assets/scss/index.scss";

// Import language files
const i18n = require("../utils/i18n");

ipcRenderer.on("settings:get", (sender, settings) => {
    i18n.setup(settings.app.languages[0]);
    ipcRenderer.removeAllListeners("settings:get");
});
ipcRenderer.send("settings:get");

const Routes = () => {
    return (
        <HashRouter>
            <div id="app">
                <Navbar>
                    <NavLink exact to="/">{i18n.__("home")}</NavLink>
                    <NavLink to="/node-red">{i18n.__("node-red")}</NavLink>
                    <NavLink to="/dashboard">{i18n.__("dashboard")}</NavLink>
                    <NavLink to="/mqttlog">{i18n.__("mqtt")}</NavLink>
                    <NavLink to="/radiomanager">{i18n.__("radio")}</NavLink>
                    <NavLink to="/firmware">{i18n.__("firmware")}</NavLink>
                    <NavLink to="/settings">{i18n.__("settings")}</NavLink>
                </Navbar>
                <main>
                    <Route path="/settings" component={Settings} />
                    <Route path="/radiomanager" component={RadioManager} />
                    <Route path="/mqttlog" component={MqttLog} />
                    <Route path="/dashboard" component={Dashboard} />
                    <Route path="/node-red" component={NodeRED} />
                    <Route path="/" exact component={Home} />
                </main>
                <HintBar />
            </div>
        </HashRouter>
    )
};

export default Routes;
