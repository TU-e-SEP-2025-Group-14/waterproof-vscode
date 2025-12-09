import { LineNumber, DocChange, WrappingDocChange, InputAreaStatus, HistoryChange, DiagnosticMessage, SimpleProgressParams, ServerStatus, ThemeStyle } from "@impermeable/waterproof-editor";
import { GoalAnswer, HypVisibility, PpString } from "../lib/types";
import { Completion } from "@impermeable/waterproof-editor";


/** Type former for the `Message` type. */
type MessageBase<T extends MessageType, B = undefined> =
    B extends undefined ? { type: T, requestId?: number } : { type: T, body: B, requestId?: number };

export type Message =
    | MessageBase<MessageType.applyStepError, string>
    | MessageBase<MessageType.command, { command: string, time?: number}>
    | MessageBase<MessageType.cursorChange, number>
    | MessageBase<MessageType.diagnostics, DiagnosticMessage>
    | MessageBase<MessageType.docChange, DocChange | WrappingDocChange>
    | MessageBase<MessageType.editorHistoryChange, HistoryChange>
    | MessageBase<MessageType.editorReady>
    | MessageBase<MessageType.errorGoals, unknown>
    | MessageBase<MessageType.init, { value: string, version: number }>
    | MessageBase<MessageType.insert, { symbolUnicode: string, type: "symbol" | "tactics", time: number }>
    | MessageBase<MessageType.lineNumbers, LineNumber>
    | MessageBase<MessageType.progress, SimpleProgressParams>
    | MessageBase<MessageType.qedStatus, InputAreaStatus[]>
    | MessageBase<MessageType.ready>
    | MessageBase<MessageType.renderGoals, { goals : GoalAnswer<PpString>, visibility?: HypVisibility }>
    | MessageBase<MessageType.renderGoalsList, { goalsList : GoalAnswer<PpString>[]}>
    | MessageBase<MessageType.response, { data: unknown, requestId: number }>
    | MessageBase<MessageType.serverStatus, ServerStatus>
    | MessageBase<MessageType.setAutocomplete, Completion[]>
    | MessageBase<MessageType.setData, string[] | GoalAnswer<PpString> >
    // ADDED: Message to switch tactics mode
    | MessageBase<MessageType.setTacticsMode, "coq" | "lean">
    | MessageBase<MessageType.setShowLineNumbers, boolean>
    | MessageBase<MessageType.setShowMenuItems, boolean>
    | MessageBase<MessageType.teacher, boolean>
    | MessageBase<MessageType.themeUpdate, ThemeStyle>
    | MessageBase<MessageType.viewportHint, { start: number, end: number }>;

export const enum MessageType {
    applyStepError,
    command,
    cursorChange,
    diagnostics,
    docChange,
    editorHistoryChange,
    editorReady,
    errorGoals,
    init,
    insert,
    lineNumbers,
    progress,
    qedStatus,
    ready,
    renderGoals,
    renderGoalsList,
    response,
    serverStatus,
    setAutocomplete,
    setData,
    setTacticsMode, // ADDED
    setShowLineNumbers,
    setShowMenuItems,
    teacher,
    themeUpdate,
    flash,
    viewportHint,
}