import { Block, CodeBlock, HintBlock, InputAreaBlock, MarkdownBlock, utils, WaterproofDocument } from "@impermeable/waterproof-editor";
import { extractCoqBlocks, extractHintBlocks, extractInputBlocks, extractMathDisplayBlocks } from "./block-extraction";

// 0A. Extract the top level blocks from the input document.
export function topLevelBlocksMV(inputDocument: string): WaterproofDocument {
    // There are five different 'top level' blocks,
    // - hint
    // - input_area
    // - math_display
    // - coq
    // - markdown

    // 0A.1 Extract the hint and input area blocks.
    const hintBlocks: HintBlock[] = extractHintBlocks(inputDocument);
    const inputAreaBlocks: InputAreaBlock[] = extractInputBlocks(inputDocument);

    // 0A.2 Mask the hint and input area blocks in the input document.
    //     Done to make extraction of coq and math display easier, since 
    //     we don't have to worry about the hint and input area blocks.
    inputDocument = utils.maskInputAndHints(inputDocument, [...hintBlocks, ...inputAreaBlocks]);

    // 0A.3 Extract the coq and math display blocks.
    const mathDisplayBlocks = extractMathDisplayBlocks(inputDocument, 0);
    const coqBlocks = extractCoqBlocks(inputDocument);

    // 0A.4 Sort the blocks by their range.
    const blocks: Block[] = utils.sortBlocks([...hintBlocks, ...inputAreaBlocks, ...mathDisplayBlocks, ...coqBlocks]);
    const markdownRanges = utils.extractInterBlockRanges(blocks, inputDocument);

    // 0A.5 Extract the markdown blocks based on the ranges.
    const markdownBlocks = utils.extractBlocksUsingRanges<MarkdownBlock>(inputDocument, markdownRanges, MarkdownBlock);
    
    // Note: Blocks parse their own inner blocks.

    // 0A.6 Prune empty blocks.
    const allBlocks = utils.sortBlocks([...blocks, ...markdownBlocks]);

    // 0A.6 Sort the blocks and return.
    return allBlocks;
}

export function topLevelBlocksLean(inputDocument: string): WaterproofDocument {
    // NOTE: this is a temporary implementation that is going to be refactored or rewritten

    // find all block comments
    const tags: RegExpExecArray[] = Array.from(inputDocument.matchAll(/(?:\r\n|\n)?\/-!?\s*([\s\S]*?)\s*-\/\r?\n/g))
    const blocks: Block[] = [];

    let currentBlock: RegExpExecArray|null = null;
    let innerBlocks: Block[] = [];

    let pushCodeBlock = (from: number, to: number) => {
        const range = { from: from, to: to };
        const innerRange = range;
        const content = inputDocument.substring(innerRange.from, innerRange.to);
        if (currentBlock)
            innerBlocks.push(new CodeBlock(content, range, innerRange));
        else
            blocks.push(new CodeBlock(content, range, innerRange));
    };

    // go over all tags
    let prevEnd = 0;
    tags.forEach((tag: RegExpExecArray, tagIndex: number) => {
        // Trim whitespace from captured content for matching
        const tagContent = tag[1].trim();

        // add a code block with the preceding text
        pushCodeBlock(prevEnd, tag.index);

        if (tagContent === "end") {
            // TODO: throw an error
            if (currentBlock === null) {
                console.warn(`[PARSER DEBUG] Tag ${tagIndex}: Found "end" tag without matching "begin". prevEnd=${prevEnd}, tag.index=${tag.index}`);
                prevEnd = tag.index + tag[0].length; // FIX: Update prevEnd even when skipping
                return;  // not in a block, ignore
            }

            const range = { from: currentBlock.index, to: tag.index + tag[0].length }
            const innerRange = { from: currentBlock.index + currentBlock[0].length, to: tag.index };
            const content = inputDocument.substring(innerRange.from, innerRange.to);
            const currentBlockContent = currentBlock[1].trim();
            if (currentBlockContent === "begin input") {
                console.log(`[PARSER DEBUG] Tag ${tagIndex}: Creating InputAreaBlock at range ${range.from}-${range.to}`);
                blocks.push(new InputAreaBlock(content, range, innerRange, innerBlocks));
                innerBlocks = [];
                prevEnd = tag.index + tag[0].length;
                currentBlock = null;
            } else if (currentBlockContent.match(/^begin details : /)) {
                console.log(`[PARSER DEBUG] Tag ${tagIndex}: Creating HintBlock`);
                const titleMatch = currentBlockContent.match(/^begin details : ([\s\S]*)/);
                const title = titleMatch ? titleMatch[1].trim() : "";
                blocks.push(new HintBlock(content, title, range, innerRange, innerBlocks));
                innerBlocks = [];
                prevEnd = tag.index + tag[0].length;
                currentBlock = null;
            }
        }

        const isMarkdown = tag[0].match(/^\/-!/);
        if (isMarkdown) {
            const content = tag[1];
            const range = { from: tag.index, to: tag.index + tag[0].length };
            const innerRange = { from: range.from + '/-!'.length, to: range.to - '-/'.length };
            blocks.push(new MarkdownBlock(content, range, innerRange));
            prevEnd = tag.index + tag[0].length;
        } else if (tagContent.match(/^begin (?:input|details : [\s\S]*?)$/)) {
            console.log(`[PARSER DEBUG] Tag ${tagIndex}: Found opening tag "${tagContent}", setting currentBlock`);
            currentBlock = tag;
            prevEnd = tag.index + tag[0].length;
        } else {
            console.log(`[PARSER DEBUG] Tag ${tagIndex}: Unhandled tag content "${tagContent}"`);
            prevEnd = tag.index + tag[0].length;
        }
    })
    // add trailing code as a block
    pushCodeBlock(prevEnd, inputDocument.length);

    return blocks.filter(block => block.range.from != block.range.to);
}
