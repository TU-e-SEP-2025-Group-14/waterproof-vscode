import { Range, TextDocument, Position } from "vscode";

import { GoalAnswer, PpString } from "../../lib/types";
import { ICoqLspClient } from "./clientTypes";
import { InputAreaStatus } from "@impermeable/waterproof-editor";
import { LeanLspClient } from "./leanlspclient";
import { WaterproofLogger as wpl } from "../helpers";

// TODO: only consider Markdown parts
function findOccurrences(substr: string, str: string): number[] {
    const indices: number[] = [];
    const substrLen = substr.length;
    for (let i = 0; (i = str.indexOf(substr, i)) >= 0; i += substrLen) indices.push(i);
    return indices;  // sorted
}

/** Returns whether input areas are not interleaved. */
function isValid(open: number[], close: number[]): boolean {
    if (open.length !== close.length) return false;
    if (open.length && open[0] > close[0]) return false;  // "base" case of loop below
    for (let i = 1; i < open.length; i++)
        if (close[i-1] > open[i] || open[i] > close[i])
            return false;
    return true;
}

export function getInputAreas(document: TextDocument): Range[] | undefined {
    const content = document.getText();

    // find (positions of) opening and closings tags for input areas, and check that they're valid
    const openOffsets = findOccurrences("<input-area>", content);
    const closeOffsets = findOccurrences("</input-area>", content);
    if (!isValid(openOffsets, closeOffsets)) return undefined;

    // We know the length of this array in advance
    const inputAreas: Range[] = new Array(openOffsets.length);
    for (let i = 0; i < openOffsets.length; i++) {
        // Convert the open and close positions to ranges
        inputAreas[i] = new Range(
            document.positionAt(openOffsets[i]),
            document.positionAt(closeOffsets[i]),
        );
    }
    return inputAreas;
}

function isComplete(response: GoalAnswer<PpString>): boolean {
    // Check if error is falsy (undefined, null, or empty), not if the property exists
    return !response.error;
}

export async function determineProofStatus(client: ICoqLspClient, document: TextDocument, inputArea: Range): Promise<InputAreaStatus> {
    // get the (end) position of the last line in the input area
    // funnily, it can be in a next input area, and we accept this
    const position = client.sentenceManager.getEndOfSentence(inputArea.end, true);
    if (!position) {
        // console.warn("qedStatus.ts : No sentence after input area");
        return InputAreaStatus.Invalid;
    }

    // check that last command is "Qed" (or return "invalid")
    // note that we don't allow, e.g., comments between "Qed" and "."
    const i = position.character - 4;
    if (i < 0 || document.lineAt(position).text.slice(i, i+4) !== "Qed.") {
        // console.warn("qedStatus.ts : Last sentence is not `Qed.`");
        return InputAreaStatus.Invalid;
    }

    // request goals and return conclusion based on them
    const response = await client.requestGoals(position.translate(0, -1));
    return isComplete(response) ? InputAreaStatus.Proven : InputAreaStatus.Incomplete;
}

// ========== Lean-specific functions ==========

/**
 * Finds input areas in Lean files using `/- begin input -/` and `/- end -/` tags.
 * This function properly handles hint blocks (`/- begin details -/` ... `/- end -/`) 
 * by only matching `/- end -/` tags that correspond to input areas.
 */
export function getLeanInputAreas(document: TextDocument): Range[] | undefined {
    const content = document.getText();

    wpl.debug(`[getLeanInputAreas] Searching for input areas in ${document.uri.fsPath}`);

    // Find opening tags: /- begin input -/
    const openPattern = /\/-\s*begin\s+input\s*-\//g;
    const openOffsets: number[] = [];
    let match;
    while ((match = openPattern.exec(content)) !== null) {
        openOffsets.push(match.index);
    }

    // Find closing tags: /- end -/
    // Store both the index and the full match for length calculation
    const closePattern = /\/-\s*end\s*-\//g;
    const closeMatches: Array<{index: number, length: number}> = [];
    while ((match = closePattern.exec(content)) !== null) {
        closeMatches.push({ index: match.index, length: match[0].length });
    }

    wpl.debug(`[getLeanInputAreas] Found ${openOffsets.length} opening tags and ${closeMatches.length} closing tags`);

    // Match opening tags with closing tags, skipping hint blocks
    const inputAreas: Range[] = [];
    let closeIndex = 0;
    
    for (let i = 0; i < openOffsets.length; i++) {
        const openOffset = openOffsets[i];
        
        // Find the next closing tag after this opening tag
        while (closeIndex < closeMatches.length && closeMatches[closeIndex].index < openOffset) {
            closeIndex++;
        }
        
        if (closeIndex >= closeMatches.length) {
            wpl.debug(`[getLeanInputAreas] No closing tag found for opening tag at ${openOffset}`);
            return undefined;
        }
        
        // Check if there's a "begin details" between this "begin input" and the next "end"
        const textBetween = content.substring(openOffset, closeMatches[closeIndex].index);
        const hasBeginDetails = /\/-\s*begin\s+details/.test(textBetween);
        
        if (hasBeginDetails) {
            // Skip this closing tag, it belongs to a details block
            closeIndex++;
            // Try the next closing tag
            if (closeIndex >= closeMatches.length) {
                wpl.debug(`[getLeanInputAreas] No closing tag found for input area at ${openOffset}`);
                return undefined;
            }
        }
        
        const startPos = document.positionAt(openOffset);
        const endPos = document.positionAt(closeMatches[closeIndex].index + closeMatches[closeIndex].length);
        inputAreas.push(new Range(startPos, endPos));
        wpl.debug(`[getLeanInputAreas] Input area ${i}: ${startPos.line + 1}:${startPos.character} to ${endPos.line + 1}:${endPos.character}`);
        closeIndex++;
    }

    wpl.debug(`[getLeanInputAreas] Returning ${inputAreas.length} input area(s)`);
    return inputAreas.length > 0 ? inputAreas : undefined;
}

/**
 * Determines the proof status for a Lean input area by checking for the `done` keyword
 * after the `/- end -/` tag.
 */
export async function determineLeanProofStatus(
    client: LeanLspClient,
    document: TextDocument,
    inputArea: Range
): Promise<InputAreaStatus> {
    // The inputArea.end should be right after the closing tag `/- end -/`
    // We need to search for "done" keyword starting from that position
    
    wpl.debug(`[determineLeanProofStatus] Checking input area ending at line ${inputArea.end.line + 1}, char ${inputArea.end.character}`);
    
    // Start searching from the line containing the end of the input area
    let startLine = inputArea.end.line;
    const maxLinesToCheck = 5;
    
    // Check the current line and next few lines for "done" keyword
    for (let lineOffset = 0; lineOffset <= maxLinesToCheck; lineOffset++) {
        const lineNum = startLine + lineOffset;
        if (lineNum >= document.lineCount) {
            wpl.debug(`[determineLeanProofStatus] Reached end of document at line ${lineNum + 1}`);
            break;
        }

        const line = document.lineAt(lineNum);
        const lineText = line.text;
        
        // Determine where to start searching on this line
        let searchStart = 0;
        if (lineOffset === 0) {
            // On the first line, start searching from the end position (after the closing tag)
            searchStart = inputArea.end.character;
        }
        
        // Search for "done" keyword on this line
        const remainingText = lineText.substring(searchStart);
        const doneMatch = remainingText.match(/\bdone\b/);
        
        if (doneMatch) {
            // Found "done" keyword
            const donePosition = new Position(lineNum, searchStart + doneMatch.index!);
            wpl.debug(`[determineLeanProofStatus] Found "done" keyword at line ${lineNum + 1}, char ${donePosition.character}`);
            
            // Request goals at the position of "done" to check if proof is complete
            try {
                wpl.debug(`[determineLeanProofStatus] Requesting goals at "done" position...`);
                const response = await client.requestGoals(donePosition);
                const isProofComplete = isComplete(response);
                const status = isProofComplete ? InputAreaStatus.Proven : InputAreaStatus.Incomplete;
                wpl.debug(`[determineLeanProofStatus] Goals response: ${isProofComplete ? 'complete (Proven)' : 'incomplete (Incomplete)'}`);
                return status;
            } catch (error: unknown) {
                wpl.debug(`[determineLeanProofStatus] Goals request failed, assuming Proven: ${error}`);
                // If goals request fails, still consider it as having "done" keyword
                return InputAreaStatus.Proven;
            }
        }
    }

    // No "done" keyword found
    wpl.debug(`[determineLeanProofStatus] No "done" keyword found within ${maxLinesToCheck} lines after input area end`);
    return InputAreaStatus.Incomplete;
}
