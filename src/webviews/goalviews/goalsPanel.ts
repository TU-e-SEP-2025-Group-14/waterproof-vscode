import { Uri } from "vscode";
import { GoalAnswer, PpString } from "../../../lib/types";
import { CoqLspClientConfig } from "../../lsp-client/clientTypes";
import { CoqGoalsPanel } from "./coqGoalsPanel";
import { Rpc } from "../../helpers/rpc";
import { InfoviewApi, EditorApi } from "@leanprover/infoview-api";
import type { Location, InitializeResult } from
    'vscode-languageserver-protocol';

export type PanelMode = 'coq' | 'lean';

export class GoalsPanel extends CoqGoalsPanel {
    private currentLocation?: Location;
    private rpc?: Rpc;
    private infoviewApi?: InfoviewApi;
    private currentMode: PanelMode = 'coq';
    private leanClient?: any;

    constructor(extensionUri: Uri, config: CoqLspClientConfig) {
        super(extensionUri, config);
    }

    public setLeanClient(leanClient: any): void {
        this.leanClient = leanClient;
    }

    public async notifyServerRestarted(initializeResult: InitializeResult): Promise<void> {
        if (this.infoviewApi) {
            await this.infoviewApi.serverRestarted(initializeResult);
        }
    }

    public updateLocation(location: Location) {
        this.currentLocation = location;
        if (this.currentMode === 'lean' && this.infoviewApi) {
            this.infoviewApi.changedCursorLocation(location);
        }
    }

    public sendServerNotification(method: string, params: any): void {
        if (this.currentMode === 'lean' && this.infoviewApi) {
            this.infoviewApi.gotServerNotification(method, params);
        }
    }
    private getEditorApi(): EditorApi {
        return {
            sendClientRequest: async (uri: string, method: string, params: any):
                Promise<any> => {
                console.log('EditorApi.sendClientRequest:', uri, method, params);
                if (this.leanClient) {
                    try {
                        return await (this.leanClient as any).sendRequest(method, params);
                    } catch (error) {
                        console.error('Error in sendClientRequest:', error);
                        throw error;
                    }
                }
                return null;
            },

            sendClientNotification: async (uri: string, method: string, params: any): Promise<void> => {
                console.log('EditorApi.sendClientNotification:', uri, method, params);
                if (this.leanClient && this.leanClient.sendNotification) {
                    this.leanClient.sendNotification(method, params);
                }
            },

            copyToClipboard: async (text: string): Promise<void> => {
                console.log('EditorApi.copyToClipboard:', text);
            },

            insertText: async (text: string, kind: any): Promise<void> => {
                console.log('EditorApi.insertText:', text, kind);
            },

            applyEdit: async (edit: any): Promise<void> => {
                console.log('EditorApi.applyEdit:', edit);
            },

            showDocument: async (show: any): Promise<void> => {
                console.log('EditorApi.showDocument:', show);
            },

            restartFile: async (uri: string): Promise<void> => {
                console.log('EditorApi.restartFile:', uri);
            },

            saveConfig: async (key: string, value: any): Promise<any> => {
                console.log('EditorApi.saveConfig:', key, value);

            },

            subscribeServerNotifications: (method: string): Promise<void> => {
                console.log('EditorApi.subscribeServerNotifications:',
                    method);
                return Promise.resolve();
            },

            unsubscribeServerNotifications: (method: string): Promise<void> => {
                console.log('EditorApi.unsubscribeServerNotifications:',
                    method);
                return Promise.resolve();
            },

            subscribeClientNotifications: (method: string): Promise<void> => {
                console.log('EditorApi.subscribeClientNotifications:',
                    method);
                return Promise.resolve();
            },

            unsubscribeClientNotifications: (method: string): Promise<void> => {
                console.log('EditorApi.unsubscribeClientNotifications:',
                    method);
                return Promise.resolve();
            },

            createRpcSession: async (uri: string): Promise<string> => {
                console.log('EditorApi.createRpcSession:', uri);
                if (this.leanClient) {
                    try {
                        const result = await (this.leanClient as any).sendRequest('$/lean/rpc/connect', {
                            uri: uri
                        });
                        console.log('RPC session created:', result);
                        return result.sessionId;
                    } catch (error) {
                        console.error('Error creating RPC session:', error);
                        throw error;
                    }
                }
                return '0';
            },

            closeRpcSession: async (sessionId: string): Promise<void> => {
                console.log('EditorApi.closeRpcSession:', sessionId);
                if (this.leanClient) {
                    try {
                        await (this.leanClient as any).sendRequest('$/lean/rpc/release', {
                            sessionId: sessionId
                        });
                    } catch (error) {
                        console.error('Error closing RPC session:', error);
                    }
                }
            },
        };
    }





    public setMode(mode: PanelMode) {
        if (this.currentMode === mode) {
            return;
        }
        this.currentMode = mode;
        this.updatePanelContent();
    }

    protected override create() {
        super.create();

        if (this._panel) {
            const originalListener = this._panel.webview.onDidReceiveMessage((msg) => {
                console.log('[GoalsPanel] Received message:', JSON.stringify(msg).substring(0, 200));
                if (this.currentMode === 'lean' && this.rpc) {
                    this.rpc.messageReceived(msg);
                } else if (this.currentMode === 'coq') {
                    this.emit('message', msg);
                }
            });
            this.disposables.push(originalListener);
        }

        if (this.currentMode === 'lean') {
            this.updatePanelContent();
        }
    }

    private updatePanelContent() {
        if (!this._panel) return;

        if (this.currentMode === 'lean') {
            // --- LEAN CONTENT GENERATION ---
            const distBase = this._panel.webview.asWebviewUri(
                Uri.joinPath(this.extensionUri, "node_modules", "@leanprover", "infoview", "dist")
            );
            // We use the infoview's script logic
            const scriptUri = this._panel.webview.asWebviewUri(
                Uri.joinPath(this.extensionUri, "out", "views", "infoview", "index.js")
            );
            const libPostfix = `.production.min.js`;

            this._panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8" />
                <meta http-equiv="Content-type" content="text/html;charset=utf-8">
                <title>Infoview</title>
                <link rel="stylesheet" href="${distBase}/index.css">
            </head>
            <body>
                <div id="root"></div>
                <script
                    data-importmap-leanprover-infoview="${distBase}/index${libPostfix}"
                    data-importmap-react="${distBase}/react${libPostfix}"
                    data-importmap-react-jsx-runtime="${distBase}/react-jsx-runtime${libPostfix}"
                    data-importmap-react-dom="${distBase}/react-dom${libPostfix}"
                    src="${scriptUri}"></script>
            </body>
            </html>`;

            this.rpc = new Rpc((msg) => {
                this._panel?.webview.postMessage(msg)
            });

            this.infoviewApi = this.rpc.getApi<InfoviewApi>();
            this.rpc.register(this.getEditorApi());

            if (this.currentLocation) {
                setTimeout(async () => {
                    await this.infoviewApi?.initialize(this.currentLocation!);
                }, 500);
            }
        } else {
            //clean up
            this.rpc = undefined;
            this.infoviewApi = undefined;
            // --- COQ CONTENT GENERATION ---
            const styleUri = this._panel.webview.asWebviewUri(
                Uri.joinPath(this.extensionUri, "out", "views", "goals", "index.css")
            );
            const scriptUri = this._panel.webview.asWebviewUri(
                Uri.joinPath(this.extensionUri, "out", "views", "goals", "index.js")
            );

            this._panel.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="stylesheet" type="text/css" href="${styleUri}">
            <script src="${scriptUri}" type="module"></script>
            <title>Coq's info panel</title>
            </head>
            <body>
                <div id="root"></div>
            </body>
            </html>
            `;

            // Restore previous Coq goals if available
            if (this.previousGoal) {
                setTimeout(() => {
                    if (this.previousGoal) super.updateGoals(this.previousGoal);
                }, 100);
            }
        }
    }

    override updateGoals(goals: GoalAnswer<PpString> | undefined) {
        // We capture the goals for restoration purposes even if we are in Lean mode
        this.previousGoal = goals;

        // But we only send the visual update message if we are actively in Coq mode
        if (this.currentMode === 'coq') {
            super.updateGoals(goals);
        }
    }
}