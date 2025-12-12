import {
    EditorApi,
    InfoviewApi,
    // InfoviewConfig,
    // LeanFileProgressParams,
    // RpcConnected,
    // RpcConnectParams,
    // RpcErrorCode,
    // RpcKeepAliveParams,
    // ServerStoppedReason,
    // TextInsertKind,
} from '@leanprover/infoview-api'
import { CoqWebview, WebviewState } from './coqWebview';
import { Rpc } from '../helpers/rpc';
import { ExtensionContext } from 'vscode';
import { Location, InitializeResult } from 'vscode-languageserver-protocol'
import { getPackedSettings } from 'http2';

export class LeanInfoviewWebview extends CoqWebview {
    private rpc: Rpc;
    private api: InfoviewApi;
    constructor(context: ExtensionContext) {
        super(context.extensionUri, "infoview", false);
    }

    protected override create(): void {
        //call parent to create webview panel
        super.create();
        if (!this._panel) return; //check if created successfully

        this.rpc = new Rpc((msg) => {
            this._panel?.webview.postMessage(msg);

        })

        this.api = this.rpc.getApi<InfoviewApi>();

        const subscription = this._panel.webview.onDidReceiveMessage((msg) => {
            this.rpc.messageReceived(msg)
        })
        this.disposables.push(subscription)

    }

    //called when Lean file is open
    public async initializeInfoview(location: Location): Promise<void> {

        if (!this.api) {
            //if we dont have api ready we cant call methods
            console.warn("Infoview API not ready");
            return;
        }

        await this.api.initialize(location);
    }

    public async updateCursorLocation(location: Location): Promise<void> {
        if (!this.api) return;

        await this.api.changedCursorLocation(location);

    }

    public async notifyServerRestarted(initializeResult: InitializeResult): Promise<void> {
        if (!this.api) return;

        await this.api.serverRestarted(initializeResult);
    }

    //so infoview can display notifications
    public async sendServerNotification(method: string, params: any): Promise<void> {
        if (!this.api) return;

        await this.api.gotServerNotification(method, params);
    }
    //TODO: handle messages



}