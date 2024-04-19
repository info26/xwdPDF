// modify dpi variable
var dpi = 96;
// following 2 variables must be adjusted in css as well
var DOCUMENT_WIDTH = 8.5 * dpi;
var DOCUMENT_HEIGHT = 11 * dpi;
// define mragins
var MARGIN_TOP = 0.3 * dpi;
var MARGIN_BOTTOM = 0.7 * dpi;
var MARGIN_LEFT = 0.5 * dpi;
var MARGIN_RIGHT = 0.5 * dpi;
// modify number of columns and space between columns
var columns = 5;
var gutter = 0.15 * dpi;

var font_size = 0.12 * dpi;

var column_width = (DOCUMENT_WIDTH - MARGIN_LEFT - MARGIN_RIGHT - gutter * (columns - 1)) / columns
// counts how many clue lists have been added
var clueListCounter = 0;
clueCounter = 0;
// specifies how many columns the grid takes up
var grid_columns = 3;
// counts how many puzzles have been generated to HTML (don't modify)
var puzzleCounter = 0;
// defines how much space the title takes up
var TITLE_HEIGHT = dpi * 0.25;
// xw = crossword objeect, pc = puzzle id
function renderGrid(xw, pc) {
    // get pixels of grid sizes
    var grid_width = (column_width * grid_columns + gutter * (grid_columns - 1));
    var cell_width = grid_width / (xw.metadata.width);
    var font_size = cell_width / 3;

    var grid = document.getElementById("grid_" + pc);
    
    grid.style.width = grid_width + "px"
    // for each cell...
    for (var cellId = 0; cellId < xw.cells.length; cellId++) {
        var addBorders = "";
        // add appropriate borders
        if (cellId % xw.metadata.width == 0) {
            addBorders += "border-left: 1px solid black;";
        }

        if (cellId < xw.metadata.width) {
            addBorders += "border-top: 1px solid black;";
        }
        // add the grid cell
        grid.insertAdjacentHTML("beforeend", `
            <div class="grid-cell" style="
                ${addBorders} 
                width: ${cell_width}px; 
                height: ${cell_width}px; 
                border-bottom: 0.1px solid black; 
                border-right: 0.1px solid black; 
                display:inline-block; 
                vertical-align: bottom; 
                font-size: ${font_size}px;
                line-height: ${font_size}px; 
                ${xw.cells[cellId].type == "block" ? "background-color: black" : ""}">
                    ${xw.cells[cellId].number ? ("<div class=\"grid-number\">" + xw.cells[cellId].number + "</div>") : ""}
                    ${xw.cells[cellId]["background-shape"] == "circle" ? "<div class=\"circle\"></div>" : ""}
            </div>
        `)
    }
}

// function places the grid by setting the top and right attributes
function positionGrid(pc) {
    var grid = document.getElementById("grid_" + pc);
    
    grid.style.position = "absolute";

    grid.style.right = MARGIN_RIGHT + "px";
    grid.style.top = MARGIN_TOP + TITLE_HEIGHT + "px";
}
// computes how tall the column should be based on what column number it is
function computeColumnHeight(number, pc) {

    if (number > columns - grid_columns) {
        return DOCUMENT_HEIGHT - TITLE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - 15 - document.getElementById("grid_" + pc).offsetHeight - gutter;
    }
    return DOCUMENT_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - TITLE_HEIGHT;
}
// computes how far the column should be from the top of the page based on what column number it is

function computeColumnTop(number, pc) {
    if (number > columns - grid_columns) {
        return MARGIN_TOP + TITLE_HEIGHT + document.getElementById("grid_" + pc).offsetHeight + gutter;
    }

    return MARGIN_TOP + TITLE_HEIGHT;
}
// computes the height of element x
function computeHeight(x) {
    return x.offsetHeight + parseInt(window.getComputedStyle(x).getPropertyValue("margin-top")) + parseInt(window.getComputedStyle(x).getPropertyValue("margin-bottom"));
}

async function renderClues(xw, pc) {
    console.log(pc, xw)
    // defines a column counter to assign an id to each div
    var columnCounter = 1;
    
    var page = document.getElementById("page_" + pc);
    // inserts a clue list for every clue
    page.insertAdjacentHTML("beforeend", `<div id="clueListInit_${pc}" class="clueDiv nospace" style="width: ${column_width}px; position: absolute; top: ${computeColumnTop(columnCounter, pc)}px; left: ${MARGIN_LEFT}px"></div>`);

    var clueList = document.getElementById(`clueListInit_` + pc);
    clueListCounter = clueListCounter + 1;
    // for each down and across clues, insert each clue
    clueList.insertAdjacentHTML("beforeend", `<p class="admarker" style="font-size: ${font_size}px"><b>ACROSS</b></p>`)
    for (var clueId = 0; clueId < xw.clues[0].clue.length; clueId++) {
        x = xw.clues[0].clue[clueId];
        clueList.insertAdjacentHTML("beforeend", `<div class="clueDiv" id="clue${window.clueCounter}" style="font-size: ${font_size}px"><div class="clueNum"><b>${x.number}</b></div><div class="clue">${x.text}</div></div>`)
        
        window.clueCounter = window.clueCounter + 1;

    }

    clueList.insertAdjacentHTML("beforeend", `<p class="admarker" style="font-size: ${font_size}px"><b>DOWN</b></p>`)

    for (var clueId = 0; clueId < xw.clues[1].clue.length; clueId++) {
        x = xw.clues[1].clue[clueId];
        clueList.insertAdjacentHTML("beforeend", `<div class="clueDiv" id="clue${window.clueCounter}" style="font-size: ${font_size}px"><div class="clueNum"><b>${x.number}</b></div><div class="clue">${x.text}</div></div>`)
        
        window.clueCounter = window.clueCounter + 1;
    }

    // wait for browser to finish processing HTML

    await new Promise(x => {
        requestAnimationFrame(x);
    });

    await new Promise(x => {
        requestAnimationFrame(x);
    });

    await new Promise(x => {
        requestAnimationFrame(x);
    });

    await new Promise(x => {
        requestAnimationFrame(x);
    });


    var columns = [[]];
    var columnNum = 0;
    var heightCounter = 0;
    // for each element in the clue list,
    for (var element = 0; element < document.getElementById("clueListInit_" + pc).children.length; element++) {
        x = document.getElementById("clueListInit_" + pc).children[element];
        // total up the heights
        heightCounter = heightCounter + computeHeight(x);
        // if the height is greater than one column
        if (heightCounter > computeColumnHeight(columnNum + 1, pc)) {
            // create a new column
            columns.push([]);
            columnNum = columnNum + 1;
            columns[columnNum].push(x);
            heightCounter = computeHeight(x);
        } else {
            // otherwise add it to the same column
            columns[columnNum].push(x);
        }
    }

    console.log(columns)
    // for each column 
    for (var columnId = 0; columnId < columns.length; columnId++) {
        var column = columns[columnId];
        // commit the elements to HTML
        page.insertAdjacentHTML("beforeend", `<div id="clueList${columnId}_${pc}" class="clueDiv nospace" style="width: ${column_width}px; position: absolute; top: ${computeColumnTop(columnId + 1, pc)}px; left: ${MARGIN_LEFT + (column_width + gutter) * (columnId)}px"></div>`);

        for (var element = 0; element < column.length; element++) {
            document.getElementById(`clueList${columnId}_${pc}`).appendChild(column[element]);
        }
    
    }

    document.getElementById("clueListInit_" + pc).remove();

}


async function start() {
    document.getElementById("pre").style.display = "none";
    // read called by button on page
    var read = async function(e) {

        
        var contents = e;
        var jsc = new JSCrossword();
        var puzdata = jsc.fromData(contents);
        // inserts each page and calls renderGrid
        document.body.insertAdjacentHTML("afterbegin", `<div class="page" id="page_${puzzleCounter}">
            <div id="title" style="font-size: ${font_size}px; left: ${MARGIN_LEFT}px; top: ${MARGIN_TOP}px; height: ${TITLE_HEIGHT}px; position: absolute; width:${DOCUMENT_WIDTH - MARGIN_LEFT - MARGIN_RIGHT}px;"><b>${puzdata.metadata.title}</i> <span style="float:right;"><b>${puzdata.metadata.author}</b></span></div>

            <div id="grid_${puzzleCounter}" style="width:600px" class="nospace">
                
            </div>
        </div>`);
        
        renderGrid(puzdata, puzzleCounter);
        positionGrid(puzzleCounter);

        await renderClues(puzdata, puzzleCounter);

        console.log(puzdata)

        puzzleCounter = puzzleCounter + 1;
    }

    // each file in the file reader...
    for (var fileId = 0; fileId < document.getElementById("files").files.length; fileId++) {
        FR = new FileReader();
        
        FR.readAsBinaryString(document.getElementById("files").files[fileId]);
        var res = await new Promise((x) => {
            FR.onload = x;
        });
        // call the function to render the page
        await read(res.target.result);
    }
    
}