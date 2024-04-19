/**
* CFP (CrossFire) reading and writing functions
**/

/* parsexml function via https://stackoverflow.com/a/19448718 */
function parseXml(e,r){let t=null;if(window.DOMParser)t=(new DOMParser).parseFromString(e,"text/xml");else{if(!window.ActiveXObject)throw new Error("cannot parse xml string!");if((t=new ActiveXObject("Microsoft.XMLDOM")).async=!1,!t.loadXML(e))throw t.parseError.reason+" "+t.parseError.srcText}function o(e,t){if("#text"==e.nodeName){let r=e.nodeValue;return void(r.trim()&&(t["#text"]=r))}let n={},a=t[e.nodeName];if(a?Array.isArray(a)?t[e.nodeName].push(n):t[e.nodeName]=[a,n]:r&&-1!=r.indexOf(e.nodeName)?t[e.nodeName]=[n]:t[e.nodeName]=n,e.attributes)for(let r of e.attributes)n[r.nodeName]=r.nodeValue;for(let r of e.childNodes)o(r,n)}let n={};for(let e of t.childNodes)o(e,n);return n}

function xw_read_cfp(xml) {
  // Read the XML into an object
  var dataObj = parseXml(xml);
  dataObj = dataObj.CROSSFIRE;
  // Pull in the metadata
  var grid_str = dataObj.GRID['#text'].trim();
  var grid_arr = grid_str.split('\n');
  var width = Number(dataObj.GRID.width);
  var height = grid_arr.length
  var metadata = {
      'title': dataObj.TITLE['#text'] || '',
      'author': dataObj.AUTHOR['#text'] || '',
      'copyright': dataObj.COPYRIGHT['#text'] || '',
      'description': dataObj.NOTES['#text'] || '',
      'height': height,
      'width': width,
      'crossword_type': 'crossword',
  };

  /*
  * `cells` is an array of cells with the various attributes
    - x and y (0-indexed)
    - "type" = 'block' if it's a block
    - "number" = number if it's numbered
    - "solution" = letter(s) that go in the box
    - others: background-color (RGB), background-shape (circle),
        bottom-bar, right-bar, top-bar, left-bar (= true if exist)
  */
  // Get circle locations if they exist
  var circle_locations = new Set();
  if (dataObj.CIRCLES) {
    circle_locations = new Set(dataObj.CIRCLES['#text'].split(',').map(Number));
  }
  // Get rebus indicators if they exist
  var rebusObj = {};
  if (dataObj.REBUSES) {
    var rebusArr = dataObj.REBUSES.REBUS;
    if (typeof(dataObj.REBUSES.REBUS)=='object') {
      rebusArr = [dataObj.REBUSES.REBUS];
    }
    rebusArr.forEach( function(r) {
      rebusObj[r.input] = r.letters.toUpperCase();
    });
  }
  var cells = [];
  for (var y=0; y < height; y++) {
      for (var x=0; x < width; x++) {
          // the grid index
          var this_index = x + y * width;

          // solution
          var solution = grid_arr[y].charAt(x);
          // replace with rebus if necessary
          solution = rebusObj[solution] || solution;
          // type
          var type = null;
          if (solution === '.') {
              type = 'block';
              solution = null;
          }

          // background shape and color
          background_shape = null;
          if (circle_locations.has(this_index)) {
            background_shape = 'circle';
          }

          var new_cell = {
              x: x,
              y: y,
              solution: solution,
              number: null, // for now
              type: type,
              "background-shape": background_shape,
          };
          cells.push(new_cell);
      } // end for x
  } // end for y

  // In order to add numbering to this we need a xwGrid object
  var thisGrid = new xwGrid(cells);
  var gn = thisGrid.gridNumbering();
  cells.forEach(function(cell) {
    var thisNumber = gn[cell.y][cell.x];
    if (thisNumber) {
      cell.number = thisNumber.toString();
    }
  });

  /*
  * `clues` is an array of (usually) two objects.
     each object within has a "title" key whose value is generally "ACROSS" or "DOWN"
     and a "clue" key, whose value is an array of clues.
     Each "clue" key has
       - a "text" value which is the actual clue
       - a "word" which is the associated word ID
       - an optional "number"
  */
  var words = [];
  // Iterate through the titles of the clues
  var entries = {'ACROSS': thisGrid.acrossEntries(), 'DOWN': thisGrid.downEntries()};
  var clues1 = {'ACROSS': [], 'DOWN': []};
  // clues and words are coupled in .cfp
  dataObj.WORDS.WORD.forEach( function(w) {
      var word_id = Number(w.id) + 1000; // we don't want an ID of 0
      var number = w.num;
      var text = w['#text'];
      var thisDir = w.dir;
      clues1[thisDir].push({'word': word_id, 'number': number, 'text': text});
      var thisCells = entries[thisDir][Number(number)].cells;
      words.push({'id': word_id, 'cells': thisCells});
  });
  var clues = [{'title': 'ACROSS', 'clue': clues1['ACROSS']}, {'title': 'DOWN', 'clue': clues1['DOWN']}];

  return new JSCrossword(metadata, cells, words, clues);
}

function xw_write_cfp(metadata, cells, words, clues) {
}
/**
* iPUZ reading/writing functions
* copyright (c) 2021 Crossword Nexus
* MIT License https://opensource.org/licenses/MIT
**/

function xw_read_ipuz(data) {
    // If `data` is a string, convert to object
    if (typeof(data) === 'string') {
        // need to read as UTF-8 first (it's generally loaded as binary)
        data = BinaryStringToUTF8String(data);
        data = JSON.parse(data);
    }
    /*
    * `metadata` has title, author, copyright, description (notes), height, width, crossword_type
    */
    // determine the type of the crossword
    var kind = data['kind'][0];

    // determine what represents a block
    const BLOCK = data['block'] || '#';
    const EMPTY = data['empty'] || '0';

    // We only support "crossword" for now
    // TODO: add in acrostic support
    if (kind.indexOf('crossword') !== -1) {
        var crossword_type = 'crossword';
    } else {
        throw `${kind} is not supported`;
    }
    var height = data["dimensions"]["height"];
    var width = data["dimensions"]["width"];
    var metadata = {
        'title': data['title'] || '',
        'author': data['author'] || '',
        'copyright': data['copyright'] || '',
        'description': data.intro || '',
        'height': height,
        'width': width,
        'crossword_type': crossword_type,
        'fakeclues': data.fakeclues
    };

    /*
    * `cells` is an array of cells with the various attributes
      - x and y (0-indexed)
      - "type" = 'block' if it's a block
      - "number" = number if it's numbered
      - "solution" = letter(s) that go in the box
      - others: background-color (RGB), background-shape (circle),
          bottom-bar, right-bar, top-bar, left-bar (= true if exist)
    */
    var cells = [];
    for (var y=0; y < height; y++) {
        for (var x=0; x < width; x++) {
            // the cell is void if the spot is NULL
            var is_void = (data['puzzle'][y][x] === null);
            // number
            var cell_attributes = data['puzzle'][y][x] || {};
            // read in the style attribute
            var style = cell_attributes.style || {};
            if (typeof(cell_attributes) !== 'object') {
                var number = cell_attributes.toString();
            }
            else {
                var number = cell_attributes['cell'] || EMPTY;
                number = number.toString();
                if (number === EMPTY) {number = null;}
            }

            // solution
            var solution = '';
            try {
                solution = data['solution'][y][x];
                if (solution.value) {
                    solution = solution.value;
                } else if (solution.cell) {
                    solution = solution.cell;
                }

            } catch {}
            // type
            var type = null;
            if (solution === BLOCK || number === BLOCK) {
                type = 'block';
            } else if (data['puzzle'][y][x] === null) {
                type = 'void';
            }
            // filled-in letter
            var letter = null;
            if (data['puzzle'][y][x]) {
                letter = data['puzzle'][y][x].value;
            }
            // bars
            var bars = {};
            if (style.barred) {
                bars['bottom-bar'] = style.barred.includes('B');
                bars['right-bar'] = style.barred.includes('R');
                bars['top-bar'] = style.barred.includes('T');
                bars['left-bar'] = style.barred.includes('L');
            }

            // background shape and color
            background_shape = style.shapebg;
            background_color = style.color;
            // official iPuz style is RGB without a "#"
            // we add that if it's missing
            if (background_color && background_color.match('^[A-Fa-f0-9]{6}$')) {
              background_color = '#' + background_color.toString();
            }
            // top-right numbers
            var top_right_number = null;
            if (style.mark) {
                top_right_number = style.mark.TR;
                number = style.mark.TL;
                // TODO: we don't currently support bottom numbers
                // we just read them in as `number` or `top_right_number` for now
                if (!number) {number = style.mark.BL;}
                if (!top_right_number) {top_right_number = style.mark.BR;}
            }

            // Change the "number" if it isn't real
            if (number === EMPTY || number === BLOCK) {
                number = null;
            }

            var new_cell = {
                x: x,
                y: y,
                solution: solution,
                number: number,
                type: type,
                "background-color": background_color,
                "background-shape": background_shape,
                letter: letter,
                top_right_number: top_right_number,
                is_void: is_void,
                clue: null,
                value: null,
                "bottom-bar": bars['bottom-bar'] || null,
                "right-bar": bars['right-bar'] || null,
                "top-bar": bars['top-bar'] || null,
                "left-bar": bars['left-bar'] || null
            };
            cells.push(new_cell);
        } // end for x
    } // end for y

    /*
    * `clues` is an array of (usually) two objects.
       each object within has a "title" key whose value is generally "ACROSS" or "DOWN"
       and a "clue" key, whose value is an array of clues.
       Each "clue" key has
         - a "text" value which is the actual clue
         - a "word" which is the associated word ID
         - an optional "number"
    */
    var clues = [];
    var words = [];
    word_id = 1;
    // Iterate through the titles of the clues
    var titles = Object.keys(data['clues']);
    // Change the order if it's down first (CrossFire export bug)
    if (titles[0].toLowerCase() == 'down' && titles[1].toLowerCase() == 'across') {
        titles = [titles[1], titles[0]];
    }
    titles.forEach( function(title) {
        var thisClues = [];
        data['clues'][title].forEach( function (clue) {
            var number, text, refs;
            // a "clue" can be an array or an object
            if (Array.isArray(clue)) {
                number = clue[0].toString();
                text = clue[1];
            } else {
                number = clue.number.toString();
                text = clue.clue;
                dict_references = clue.references;
                dict_continued = clue.continued;
                refs = Object.assign({}, dict_references, dict_continued); // treat these as the same
            }
            thisClues.push({'word': word_id, 'number': number, 'text': text, 'refs': refs});
            // Cells are coupled with clues in iPuz
            if (clue.cells) {
                var thisCells = [];
                clue.cells.forEach(function (thisCell) {
                    thisCells.push([thisCell[0]-1, thisCell[1]-1]);
                });
                words.push({'id': word_id, 'cells': thisCells});
            }
            word_id += 1;
        });
        clues.push({'title': title, 'clue': thisClues});
    });

    /*
    * `words` is an array of objects, each with an "id" and a "cells" attribute
      "id" is just a unique number to match up with the clues.
      "cells" is an array of objects giving the x and y values, in order
    */
    // We only do this if we haven't already populated `words`
    if (!words.length) {
        var thisGrid = new xwGrid(cells);
        var word_id = 1;
        var acrossEntries = thisGrid.acrossEntries();
        Object.keys(acrossEntries).forEach(function(i) {
            var thisWord = {'id': word_id++, 'cells': acrossEntries[i]['cells'], 'dir': 'across'};
            words.push(thisWord);
        });
        var downEntries = thisGrid.downEntries();
        Object.keys(downEntries).forEach(function(i) {
            var thisWord = {'id': word_id++, 'cells': downEntries[i]['cells'], 'dir': 'down'};
            words.push(thisWord);
        });
    }

    return new JSCrossword(metadata, cells, words, clues);
}

function xw_write_ipuz(metadata, cells, words, clues) {
}
/**
* JPZ reading/writing functions
* copyright (c) 2021 Crossword Nexus
* MIT License https://opensource.org/licenses/MIT
**/

// helper function to escape HTML
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

function XMLElementToString(element) {
    var i,
     node,
     nodename,
     nodes = element.childNodes,
     result = '';
    for (i = 0; (node = nodes[i]); i++) {
        if (node.nodeType === 3) {
            result += node.textContent;
        }
        if (node.nodeType === 1) {
             nodename = node.nodeName;
             result +=
               '<' +
               nodename +
               '>' +
               XMLElementToString(node) +
               '</' +
               nodename +
               '>';
        }
    }
 return result;
}

function xw_read_jpz(data1) {
    var ERR_PARSE_JPZ = 'Error parsing JPZ file.';

    var data = data1;
    
    // try to unzip (file may not be zipped)
    var unzip = new JSUnzip();
    var result = unzip.open(data1);
    // there should be at most one file in here
    // if it's not a zip file this will be an empty array
    for (var n in unzip.files) {
        var result2 = unzip.read(n);
        data = result2.data;
        break;
    }
    
    data = BinaryStringToUTF8String(data);
    // create a DOMParser object
    var xml_string = data.replace('&nbsp;', ' ');
    var parser, xmlDoc;
    if (window.DOMParser) {
        parser = new DOMParser();
        xmlDoc = parser.parseFromString(xml_string, 'text/xml');
    } else {
        // Internet Explorer
        xmlDoc = new ActiveXObject('Microsoft.XMLDOM');
        xmlDoc.async = false;
        xmlDoc.loadXML(xml_string);
    }
    var crossword, puzzle, jpz_metadata;
    puzzle = xmlDoc.getElementsByTagName('rectangular-puzzle');
    if (!puzzle.length) {
        throw {
          name: ERR_PARSE_JPZ,
          message: 'Could not find puzzle data'
        };
    }

    // determine the type of the crossword
    var CROSSWORD_TYPES = ['crossword', 'coded', 'acrostic'];
    var crossword_type;
    for (var _i = 0; _i < CROSSWORD_TYPES.length; _i++) {
        crossword_type = CROSSWORD_TYPES[_i];
        crossword = xmlDoc.getElementsByTagName(crossword_type);
        if (crossword.length > 0) {
            break;
        }
    }
    crossword = crossword[0];

    // metadata
    jpz_metadata = puzzle[0].getElementsByTagName('metadata');
    if (!jpz_metadata.length) {
        throw {
          name: ERR_PARSE_JPZ,
          message: 'Could not find metadata'
        };
    }

    var metadata = {'title': '', 'author': '', 'copyright': '', 'description': ''};

    var title = jpz_metadata[0].getElementsByTagName('title');
    var creator = jpz_metadata[0].getElementsByTagName('creator');
    var copyright = jpz_metadata[0].getElementsByTagName('copyright');
    var description = jpz_metadata[0].getElementsByTagName('description');

    if (title.length) {
        metadata['title'] = XMLElementToString(title[0]);
    }
    if (creator.length) {
        metadata['author'] = XMLElementToString(creator[0]);
    }
    if (copyright.length) {
        metadata['copyright'] = XMLElementToString(copyright[0]);
    }
    if (description.length) {
        metadata['description'] = XMLElementToString(description[0]);
    }

    metadata['crossword_type'] = crossword_type;

    // logic for check/reveal buttons
    var applet_settings = xmlDoc.getElementsByTagName('applet-settings');
    if (applet_settings.length) {
        var elt = applet_settings[0].getElementsByTagName('solution');
        if (!elt.length) {
            metadata['has_reveal'] = false;
        }
    }

    // solved message
    var completion = xmlDoc.getElementsByTagName('completion');
    if (completion.length) {
        metadata['completion_message'] = XMLElementToString(completion[0]);
    }

    // cells
    var cells = [];
    var i,
        cell,
        word,
        clues_block,
        grid = crossword.getElementsByTagName('grid')[0],
        grid_look = grid.getElementsByTagName('grid-look')[0],
        xml_cells = grid.getElementsByTagName('cell'),
        xml_words = crossword.getElementsByTagName('word'),
        xml_clues = crossword.getElementsByTagName('clues');

    metadata.width = Number(grid.getAttribute('width'));
    metadata.height = Number(grid.getAttribute('height'));

    for (i=0; (cell = xml_cells[i]); i++) {
        var new_cell = {
            x: Number(cell.getAttribute('x')) - 1,
            y: Number(cell.getAttribute('y')) - 1,
            solution: cell.getAttribute('solution'),
            number: cell.getAttribute('number'),
            type: cell.getAttribute('type'),
            "background-color": cell.getAttribute('background-color'),
            "background-shape": cell.getAttribute('background-shape'),
            letter: cell.getAttribute('solve-state'),
            top_right_number: cell.getAttribute('top-right-number'),
            is_void: cell.getAttribute('type') === 'void',
            clue: cell.getAttribute('type') === 'clue',
            value: cell.textContent
        };

        // if there's a "hint" attribute we replace the "letter" attribute
        if (cell.getAttribute('hint') === 'true') {
          new_cell['letter'] = new_cell['solution'];
        }

        // for barred puzzles
        if (
          cell.getAttribute('top-bar') ||
          cell.getAttribute('bottom-bar') ||
          cell.getAttribute('left-bar') ||
          cell.getAttribute('right-bar')
        ) {
            new_cell['top-bar'] = cell.getAttribute('top-bar') === 'true';
            new_cell['bottom-bar'] = cell.getAttribute('bottom-bar') === 'true';
            new_cell['left-bar'] = cell.getAttribute('left-bar') === 'true';
            new_cell['right-bar'] = cell.getAttribute('right-bar') === 'true';
        }
        cells.push(new_cell);
    }

    /** WORDS **/
    var words = [];
    // helper function to get cell values from "x" and "y" strings
    function cells_from_xy(x, y) {
      var word_cells = [];
      var split_x = x.split('-');
      var split_y = y.split('-');
      if (split_x.length > 1) {
        var x_from = Number(split_x[0]); var x_to = Number(split_x[1]);
        var y1 = Number(split_y[0]);
        for (var k=x_from;
            (x_from < x_to ? k <= x_to : k >= x_to);
            (x_from < x_to ? k++ : k--)) {
            word_cells.push([k-1, y1-1]);
        }
      } else if (split_y.length > 1) {
        var y_from = Number(split_y[0]); var y_to = Number(split_y[1]);
        var x1 = Number(split_x[0]);
        for (var k=y_from;
            (y_from < y_to ? k <= y_to : k >= y_to);
            (y_from < y_to ? k++ : k--)) {
            word_cells.push([x1-1, k-1]);
        }
      } else {
          word_cells.push([split_x[0]-1, split_y[0]-1]);
      }
      return word_cells;
    }
    for (i = 0; (word = xml_words[i]); i++) {
        var id = word.getAttribute('id');
        var x = word.getAttribute('x');
        var y = word.getAttribute('y');
        var word_cells = [];
        if (x && y) {
            var new_cells = cells_from_xy(x, y);
            word_cells = word_cells.concat(new_cells);

        }
        // otherwise the word must have "cells" attributes
        // note that it may have both
        var wc = word.getElementsByTagName('cells');
        for (var j=0; j<wc.length; j++) {
            cell = wc[j];
            x = cell.getAttribute('x');
            y = cell.getAttribute('y');
            var new_cells = cells_from_xy(x, y);
            word_cells = word_cells.concat(new_cells);
        }
        words.push({'id': id, 'cells': word_cells});
    }

    // CLUES
    var clues = [];
    if (crossword_type == 'coded') {
        // pass: no clues
    } else {
        for (i = 0; (clues_block = xml_clues[i]); i++) {
            var title_el = clues_block.getElementsByTagName('title')[0];
            var clues_el = clues_block.getElementsByTagName('clue');
            var title = title_el.textContent.trim();
            var this_clue = [];
            var k, clue;
            for (k=0; clue = clues_el[k]; k++) {
                var word_id = clue.getAttribute('word');
                var clue_number = clue.getAttribute('number');
                var fmt = clue.getAttribute('format');
                var _text = clue.innerHTML.trim();
                if (fmt) {
                    _text = _text + ` (${fmt})`;
                }
                this_clue.push({'text': _text, 'word': word_id, 'number': clue_number});
            }
            clues.push({'title': title, 'clue': this_clue});
        }
    }

    return new JSCrossword(metadata, cells, words, clues);
}

function xw_write_jpz(metadata, cells, words, clues) {
    var i, j;
    var title = escapeHtml(metadata.title);
    var author = escapeHtml(metadata.author);
    var copyright = escapeHtml(metadata.copyright);
    var description = escapeHtml(metadata.description);
    var jpz_string = `<?xml version="1.0" encoding="UTF-8"?>
<crossword-compiler-applet xmlns="http://crossword.info/xml/crossword-compiler">
<applet-settings width="720" height="600" cursor-color="#00FF00" selected-cells-color="#80FF80">
<completion friendly-submit="false" only-if-correct="true">Congratulations!  The puzzle is solved correctly</completion>
<actions graphical-buttons="false" wide-buttons="false" buttons-layout="left"><reveal-word label="Reveal Word"></reveal-word><reveal-letter label="Reveal"></reveal-letter><check label="Check"></check><solution label="Solution"></solution><pencil label="Pencil"></pencil></actions>
</applet-settings>
<rectangular-puzzle xmlns="http://crossword.info/xml/rectangular-puzzle" alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ">
<metadata>
<title>${title}</title>
<creator>${author}</creator>
<copyright>${copyright}</copyright>
<description>${description}</description>
</metadata>
<crossword>
<grid width="${metadata.width}" height="${metadata.height}">
<grid-look hide-lines="true" cell-size-in-pixels="25" />\n`;
    /* take care of cells in the grid */
    for (i=0; i<cells.length; i++) {
        var cell = cells[i];
        var clue_attrs = '';
        var cell_arr = Object.keys(cell);
        for (var j=0; j < cell_arr.length; j++) {
            var my_key = cell_arr[j];
            var my_val = cell[my_key];
            if (my_key == 'x' || my_key == 'y') {
                my_val = Number(my_val) + 1;
            }
            // AFAIK if this value is "null" or "false" it does not hurt to exclude it
            if (my_val) {
              clue_attrs += `${my_key}="${my_val}" `;
            }
        }
        jpz_string += `        <cell ${clue_attrs} />\n`;
    }
    jpz_string += "    </grid>\n";
    /* take care of the words */
    for (i=0; i<words.length; i++) {
        var word = words[i];
        jpz_string += `    <word id="${word.id}">\n`;
        for (j=0; j<word.cells.length; j++) {
            var word_cell = word.cells[j];
            var this_x = Number(word_cell[0]) + 1;
            var this_y = Number(word_cell[1]) + 1;
            jpz_string += `        <cells x="${this_x}" y="${this_y}" />\n`;
        }
        jpz_string += `    </word>\n`;
    }

    /* clues */
    for (i=0; i < clues.length; i++) {
        jpz_string += `    <clues ordering="normal">\n`;
        jpz_string += `        <title>${clues[i].title}</title>\n`;
        for (j=0; j < clues[i].clue.length; j++) {
            var my_clue = clues[i].clue[j];
            var my_clue_text = escapeHtml(my_clue.text);
            jpz_string += `        <clue word="${my_clue.word}" number="${my_clue.number}">${my_clue_text}</clue>\n`;
        }
        jpz_string += `    </clues>\n`;
    }
    jpz_string += `</crossword>
</rectangular-puzzle>
</crossword-compiler-applet>\n`;
    return jpz_string;
}
/**
* Class for a crossword grid
**/
class xwGrid {
    constructor(cells) {
        this.cells = cells;
        this.height = Math.max.apply(null, cells.map(c => parseInt(c.y))) + 1;
        this.width = Math.max.apply(null, cells.map(c => parseInt(c.x))) + 1;
        this.numbers = this.gridNumbering();
    }
    /* return the cell at (x,y) */
    cellAt(x, y) {
        return this.cells.find((cell) => (cell.x == x && cell.y == y));
    }
    letterAt(x, y) {
        return this.cellAt(x, y).solution;
    }
    isBlack(x, y) {
        var thisCell = this.cellAt(x, y);
        return (thisCell.type == 'void' || thisCell.type == 'block');
    }
    /* check if we have a black square in a given direction */
    hasBlack(x, y, dir) {
        var mapping_dict = {
          'right': {'xcheck': this.width-1, 'xoffset': 1, 'yoffset': 0, 'dir2': 'left'}
        , 'left': {'xcheck': 0, 'xoffset': -1, 'yoffset': 0, 'dir2': 'right'}
        , 'top': {'ycheck': 0, 'xoffset': 0, 'yoffset': -1, 'dir2': 'bottom'}
        , 'bottom': {'ycheck': this.height-1, 'xoffset': 0, 'yoffset': 1, 'dir2': 'top'}
        };
        var md = mapping_dict[dir];
        if (x === md['xcheck'] || y === md['ycheck']) {
          return true;
        }
        else if (this.isBlack(x + md['xoffset'], y + md['yoffset'])) {
          return true;
        }
        else if (this.cellAt(x, y)[dir + '-bar']) {
          return true;
        }
        else if (this.cellAt(x + md['xoffset'], y + md['yoffset'])[md['dir2'] + '-bar']) {
          return true;
        }
        return false;
    }

    // both startAcrossWord and startDownWord have to account for bars
    startAcrossWord(x, y) {
        return this.hasBlack(x, y, 'left') && x < this.width - 1 && !this.isBlack(x, y) && !this.hasBlack(x, y, 'right');
    }
    startDownWord(x, y) {
        return this.hasBlack(x, y, 'top') && y < this.height - 1 && !this.isBlack(x, y) && !this.hasBlack(x, y, 'bottom');
    }
    // An array of grid numbers
    gridNumbering() {
        var numbers = [];
        var thisNumber = 1;
        for (var y=0; y < this.height; y++) {
            var thisNumbers = [];
            for (var x=0; x < this.width; x++) {
                if (this.startAcrossWord(x, y) || this.startDownWord(x, y)) {
                    thisNumbers.push(thisNumber);
                    thisNumber += 1;
                }
                else {
                    thisNumbers.push(0);
                }
            }
            numbers.push(thisNumbers);
        }
        return numbers;
    }

    acrossEntries() {
        var acrossEntries = {}, x, y, thisNum;
        for (y = 0; y < this.height; y++) {
            for (x = 0; x < this.width; x++) {
                if (this.startAcrossWord(x, y)) {
                    thisNum = this.numbers[y][x];
                    if (!acrossEntries[thisNum] && thisNum) {
                        acrossEntries[thisNum] = {'word': '', 'cells': []};
                    }
                }
                if (!this.isBlack(x, y) && thisNum) {
                    var letter = this.letterAt(x, y);
                    acrossEntries[thisNum]['word'] += letter;
                    acrossEntries[thisNum]['cells'].push([x, y]);
                }
                // end the across entry if we hit the edge
                if (this.hasBlack(x, y, 'right')) {
                    thisNum = null;
                }
            }
        }
        return acrossEntries;
    }

    downEntries() {
        var downEntries = {}, x, y, thisNum;
        for (x = 0; x < this.width; x++) {
            for (y = 0; y < this.height; y++) {
                if (this.startDownWord(x, y)) {
                    thisNum = this.numbers[y][x];
                    if (!downEntries[thisNum] && thisNum) {
                        downEntries[thisNum] = {'word': '', 'cells': []};
                    }
                }
                if (!this.isBlack(x, y) && thisNum) {
                    var letter = this.letterAt(x, y);
                    downEntries[thisNum]['word'] += letter;
                    downEntries[thisNum]['cells'].push([x, y]);
                }
                // end the down entry if we hit the bottom
                if (this.hasBlack(x, y, 'bottom')) {
                    thisNum = null;
                }
            }
        }
        return downEntries;
    }
}

/**
* Since we're reading everything in as a binary string
* we need a function to convert to a UTF-8 string
* Note that if .readAsBinaryString() goes away,
* we will have to change both this and the reading method.
**/
function BinaryStringToUTF8String(x) {
    // convert to bytes array
    var bytes = [];
    for (var i = 0; i < x.length; ++i) {
      var code = x.charCodeAt(i);
      bytes.push([code]);
    }
    var bytes1 = new Uint8Array(bytes);
    return new TextDecoder("utf-8").decode(bytes1);
}

// function to get an index from an i, j, and width
function xw_ij_to_index(i, j, w) {
    return j * w + i;
}

// function to convert an index to i, j
function xw_index_to_ij(ix, w) {
    var j = Math.floor(ix/w);
    var i = ix - j*w;
    return [i, j];
}

/** Generic file download function **/
function file_download(data, filename, type) {
    var file = new Blob([data], {type: type});
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var a = document.createElement("a"),
                url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}

class JSCrossword {
    /*
    * `metadata` has
      - title, author, copyright, description (notes)
      - height, width
      - crossword_type (crossword, coded, acrostic)
      OPTIONAL:
      - has_reveal (default: true)
      - completion_message
    * `cells` is an array of cells with the various attributes
      - x and y (0-indexed)
      - "type" = 'block' if it's a block
      - "number" = number if it's numbered
      - "solution" = letter(s) that go in the box
      - others: background-color (RGB), background-shape (circle),
          bottom-bar, right-bar, top-bar, left-bar (= true if exist)
          top_right_number
          value (a filled-in letter, if any)

    * `words` is an array of objects, each with an "id" and a "cells" attribute
      "id" is just a unique number to match up with the clues.
      "cells" is an array of objects giving the x and y values, in order
    * `clues` is an array of (usually) two objects.
       each object within has a "title" key whose value is generally "ACROSS" or "DOWN"
       and a "clue" key, whose value is an array of clues.
       Each "clue" key has
         - a "text" value which is the actual clue
         - a "word" which is the associated word ID
         - an optional "number"
    */
    constructor(metadata, cells, words, clues) {
        this.metadata = metadata;
        this.cells = cells;
        this.words = words;
        this.clues = clues;
    }

    //CROSSWORD_TYPES = ['crossword', 'coded', 'acrostic'];

    /**
    * useful functions
    **/

    /** set has_check and has_reveal as needed **/
    set_check_reveal() {
        var all_letters = new Set(this.cells.map(x=> x.solution));
        if (all_letters.size <= 2) {
            this.metadata.has_check = false;
            this.metadata.has_reveal = false;
        }
    }

    /** Create a solution array **/
    create_solution_array() {
        // initialize an empty array given the width and height
        var h = this.metadata.height;
        var w = this.metadata.width;
        var solutionArray = Array.from({ length: h }, () =>
            Array.from({ length: w }, () => false)
        );
        // Loop through the "cells" array and populate
        this.cells.forEach(function(c) {
            solutionArray[c.y][c.x] = c.solution;
        });
        this.solution_array = solutionArray;
    }

    /** Get the solution array **/
    get_solution_array() {
        if (!this.solution_array) {
            this.create_solution_array();
        }
        return this.solution_array;
    }

    /** Create a mapping of word ID to entry **/
    create_entry_mapping() {
        var soln_arr = this.get_solution_array();
        var entryMapping = {};
        this.words.forEach(function(w) {
            var _id = w.id;
            var entry = '';
            w.cells.forEach(function(arr) {
                entry += soln_arr[arr[1]][arr[0]];
            });
            entryMapping[_id] = entry;
        });
        this.entry_mapping = entryMapping;
    }

    /** Get the entry mapping **/
    get_entry_mapping() {
        if (!this.entry_mapping) {
            this.create_entry_mapping();
        }
        return this.entry_mapping;
    }

    /**
    * Read in data from various file formats
    **/

    /** puz **/
    // requires puz_read_write.js
    fromPuz(contents) {
        // Read data into a puzapp
        var puzdata = PUZAPP.parsepuz(contents);
        return jscrossword_from_puz(puzdata);
    }

    /** JPZ **/
    // requires jpz_read_write.js (and JSZip??)
    fromJPZ(data) {
        return xw_read_jpz(data);
    }

    /** iPUZ **/
    // requires ipuz_read_write.js
    fromIpuz(data) {
        return xw_read_ipuz(data);
    }

    /** CFP **/
    // requires cfp_read_write.js
    fromCFP(data) {
        return xw_read_cfp(data);
    }

    /* try to determine the puzzle type */
    fromData(data) {
        var js;
        try {
            var puzdata = PUZAPP.parsepuz(data);
            js = jscrossword_from_puz(puzdata);
        } catch (error) {
            console.log(error);
            try {
                js = xw_read_jpz(data);
            } catch (error2) {
                console.log(error2);
                try {
                  js = xw_read_ipuz(data);
                } catch (error3) {
                  console.log(error3);
                  js = xw_read_cfp(data);
                }
            }
        }
        js.set_check_reveal();
        return js;
    }

    /**
    * Write data for downloads
    **/

    /**
    * write JPZ
    **/
    toJPZString() {
        return xw_write_jpz(this.metadata, this.cells, this.words, this.clues);
    }
}

/**
* Secure Hash Algorithm (SHA1)
* http://www.webtoolkit.info/
**/
// This is helpful for checking if IPUZ-locked files are correctly solved
function SHA1(r){function o(r,o){return r<<o|r>>>32-o}function e(r){var o,e="";for(o=7;o>=0;o--)e+=(r>>>4*o&15).toString(16);return e}var t,a,h,n,C,c,f,d,A,u=new Array(80),g=1732584193,i=4023233417,s=2562383102,S=271733878,m=3285377520,p=(r=function(r){r=r.replace(/\r\n/g,"\n");for(var o="",e=0;e<r.length;e++){var t=r.charCodeAt(e);t<128?o+=String.fromCharCode(t):t>127&&t<2048?(o+=String.fromCharCode(t>>6|192),o+=String.fromCharCode(63&t|128)):(o+=String.fromCharCode(t>>12|224),o+=String.fromCharCode(t>>6&63|128),o+=String.fromCharCode(63&t|128))}return o}(r)).length,l=new Array;for(a=0;a<p-3;a+=4)h=r.charCodeAt(a)<<24|r.charCodeAt(a+1)<<16|r.charCodeAt(a+2)<<8|r.charCodeAt(a+3),l.push(h);switch(p%4){case 0:a=2147483648;break;case 1:a=r.charCodeAt(p-1)<<24|8388608;break;case 2:a=r.charCodeAt(p-2)<<24|r.charCodeAt(p-1)<<16|32768;break;case 3:a=r.charCodeAt(p-3)<<24|r.charCodeAt(p-2)<<16|r.charCodeAt(p-1)<<8|128}for(l.push(a);l.length%16!=14;)l.push(0);for(l.push(p>>>29),l.push(p<<3&4294967295),t=0;t<l.length;t+=16){for(a=0;a<16;a++)u[a]=l[t+a];for(a=16;a<=79;a++)u[a]=o(u[a-3]^u[a-8]^u[a-14]^u[a-16],1);for(n=g,C=i,c=s,f=S,d=m,a=0;a<=19;a++)A=o(n,5)+(C&c|~C&f)+d+u[a]+1518500249&4294967295,d=f,f=c,c=o(C,30),C=n,n=A;for(a=20;a<=39;a++)A=o(n,5)+(C^c^f)+d+u[a]+1859775393&4294967295,d=f,f=c,c=o(C,30),C=n,n=A;for(a=40;a<=59;a++)A=o(n,5)+(C&c|C&f|c&f)+d+u[a]+2400959708&4294967295,d=f,f=c,c=o(C,30),C=n,n=A;for(a=60;a<=79;a++)A=o(n,5)+(C^c^f)+d+u[a]+3395469782&4294967295,d=f,f=c,c=o(C,30),C=n,n=A;g=g+n&4294967295,i=i+C&4294967295,s=s+c&4294967295,S=S+f&4294967295,m=m+d&4294967295}return(A=e(g)+e(i)+e(s)+e(S)+e(m)).toLowerCase()}
/*
 * JSUnzip
 *
 * Copyright (c) 2011 by Erik Moller
 * All Rights Reserved
 *
 * This software is provided 'as-is', without any express
 * or implied warranty.  In no event will the authors be
 * held liable for any damages arising from the use of
 * this software.
 *
 * Permission is granted to anyone to use this software
 * for any purpose, including commercial applications,
 * and to alter it and redistribute it freely, subject to
 * the following restrictions:
 *
 * 1. The origin of this software must not be
 *    misrepresented; you must not claim that you
 *    wrote the original software. If you use this
 *    software in a product, an acknowledgment in
 *    the product documentation would be appreciated
 *    but is not required.
 *
 * 2. Altered source versions must be plainly marked
 *    as such, and must not be misrepresented as
 *    being the original software.
 *
 * 3. This notice may not be removed or altered from
 *    any source distribution.
 */

 /* Minified code -- the original is at https://github.com/operasoftware/jsunzip/blob/master/source/jsunzip.js */

var tinf;function JSUnzip(){"use strict";this.getInt=function(t,e){switch(e){case 4:return this.data[t+3]<<24|this.data[t+2]<<16|this.data[t+1]<<8|this.data[t+0];case 2:return this.data[t+1]<<8|this.data[t+0];default:return this.data[t]}},this.getDOSDate=function(t,e){return new Date(1980+(t>>>9&127),(t>>>5&15)-1,31&t,e>>>11&31,e>>>5&63,2*(31&e))},this.stringOf=function(t){for(var e="",s=0;s<t.length;++s)e+=String.fromCharCode(t[s]);return e},this.open=function(t){var e;if("string"==typeof t)for(this.data=new Uint8Array(t.length),e=0;e<t.length;++e)this.data[e]=255&t.charCodeAt(e);else this.data=t;if(this.files=[],this.data.length<22)return{status:!1,error:"Invalid data"};for(var s=this.data.length-22;s>=0&&101010256!=this.getInt(s,4);)--s;if(s<0)return{status:!1,error:"Invalid data"};if(0!==this.getInt(s+4,2)||0!==this.getInt(s+6,2))return{status:!1,error:"No multidisk support"};var i=this.getInt(s+8,2),r=this.getInt(s+16,4),n=this.getInt(s+20,2);this.comment=this.stringOf(this.data.subarray(s+22,s+22+n));var a=r;for(e=0;e<i;++e){if(33639248!=this.getInt(a+0,4))return{status:!1,error:"Invalid data"};
/*if(this.getInt(a+6,2)>20)return{status:!1,error:"Unsupported version"};*/
if(1&this.getInt(a+8,2))return{status:!1,error:"Encryption not implemented"};var h=this.getInt(a+10,2);if(0!==h&&8!==h)return{status:!1,error:"Unsupported compression method"};var o=this.getInt(a+12,2),d=this.getInt(a+14,2),u=this.getDOSDate(d,o),c=(this.getInt(a+16,4),this.getInt(a+20,4)),l=this.getInt(a+24,4),f=this.getInt(a+28,2),b=this.getInt(a+30,2),g=this.getInt(a+32,2),_=this.getInt(a+42,4),I=this.stringOf(this.data.subarray(a+46,a+46+f)),v=this.stringOf(this.data.subarray(a+46+f+b,a+46+f+b+g));if(67324752!=this.getInt(_+0,4))return{status:!1,error:"Invalid data"};var m=_+30+this.getInt(_+26,2)+this.getInt(_+28,2);this.files[I]={fileComment:v,compressionMethod:h,compressedSize:c,uncompressedSize:l,localFileContent:m,lastModifiedDate:u},a+=46+f+b+g}return{status:!0}},this.readBinary=function(t){var e=this.files[t];if(e){if(8==e.compressionMethod){tinf||(tinf=new TINF).init();var s=tinf.uncompress(this.data,e.localFileContent,e.uncompressedSize);return s.status==tinf.OK?{status:!0,data:s.data}:{status:!1,error:s.error}}return{status:!0,data:this.data.subarray(e.localFileContent,e.localFileContent+e.uncompressedSize)}}return{status:!1,error:"File '"+t+"' doesn't exist in zip"}},this.read=function(t){var e=this.readBinary(t);return e.data&&(e.data=this.stringOf(e.data)),e}}function TINF(){this.OK=0,this.DATA_ERROR=-3,this.TREE=function(){this.table=new Array(16),this.trans=new Array(288)},this.DATA=function(t){this.source="",this.sourceIndex=0,this.tag=0,this.bitcount=0,this.dest=[],this.ltree=new t.TREE,this.dtree=new t.TREE},this.sltree=new this.TREE,this.sdtree=new this.TREE,this.length_bits=new Array(30),this.length_base=new Array(30),this.dist_bits=new Array(30),this.dist_base=new Array(30),this.clcidx=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],this.build_bits_base=function(t,e,s,i){var r,n;for(r=0;r<s;++r)t[r]=0;for(r=0;r<30-s;++r)t[r+s]=Math.floor(r/s);for(n=i,r=0;r<30;++r)e[r]=n,n+=1<<t[r]},this.build_fixed_trees=function(t,e){var s;for(s=0;s<7;++s)t.table[s]=0;for(t.table[7]=24,t.table[8]=152,t.table[9]=112,s=0;s<24;++s)t.trans[s]=256+s;for(s=0;s<144;++s)t.trans[24+s]=s;for(s=0;s<8;++s)t.trans[168+s]=280+s;for(s=0;s<112;++s)t.trans[176+s]=144+s;for(s=0;s<5;++s)e.table[s]=0;for(e.table[5]=32,s=0;s<32;++s)e.trans[s]=s},this.build_tree=function(t,e,s,i){var r,n,a=new Array(16);for(r=0;r<16;++r)t.table[r]=0;for(r=0;r<i;++r)t.table[e[s+r]]++;for(t.table[0]=0,n=0,r=0;r<16;++r)a[r]=n,n+=t.table[r];for(r=0;r<i;++r)e[s+r]&&(t.trans[a[e[s+r]]++]=r)},this.getbit=function(t){var e;return t.bitcount--||(t.tag=t.source[t.sourceIndex++],t.bitcount=7),e=1&t.tag,t.tag>>>=1,e},this.read_bits=function(t,e,s){if(!e)return s;for(var i;t.bitcount<24;)t.tag=t.tag|t.source[t.sourceIndex++]<<t.bitcount,t.bitcount+=8;return i=t.tag&65535>>>16-e,t.tag>>>=e,t.bitcount-=e,i+s},this.decode_symbol=function(t,e){for(;t.bitcount<24;)t.tag=t.tag|t.source[t.sourceIndex++]<<t.bitcount,t.bitcount+=8;var s=0,i=0,r=0;do{i=2*i+((t.tag&1<<r)>>>r),++r,s+=e.table[r],i-=e.table[r]}while(i>=0);return t.tag>>>=r,t.bitcount-=r,e.trans[s+i]},this.decode_trees=function(t,e,s){var i,r,n,a,h,o,d=new this.TREE;for(lengths=new Array(320),i=this.read_bits(t,5,257),r=this.read_bits(t,5,1),n=this.read_bits(t,4,4),a=0;a<19;++a)lengths[a]=0;for(a=0;a<n;++a){var u=this.read_bits(t,3,0);lengths[this.clcidx[a]]=u}for(this.build_tree(d,lengths,0,19),h=0;h<i+r;){var c=this.decode_symbol(t,d);switch(c){case 16:var l=lengths[h-1];for(o=this.read_bits(t,2,3);o;--o)lengths[h++]=l;break;case 17:for(o=this.read_bits(t,3,3);o;--o)lengths[h++]=0;break;case 18:for(o=this.read_bits(t,7,11);o;--o)lengths[h++]=0;break;default:lengths[h++]=c}}this.build_tree(e,lengths,0,i),this.build_tree(s,lengths,i,r)},this.inflate_block_data=function(t,e,s){for(var i=t.dest,r=t.destIndex;;){var n,a,h,o,d=this.decode_symbol(t,e);if(256==d)return t.destIndex=r,this.OK;if(d<256)i[r++]=d;else for(d-=257,n=this.read_bits(t,this.length_bits[d],this.length_base[d]),a=this.decode_symbol(t,s),o=h=r-this.read_bits(t,this.dist_bits[a],this.dist_base[a]);o<h+n;++o)i[r++]=i[o]}},this.inflate_uncompressed_block=function(t){var e,s;if((e=256*(e=t.source[t.sourceIndex+1])+t.source[t.sourceIndex])!=(65535&~(256*t.source[t.sourceIndex+3]+t.source[t.sourceIndex+2])))return this.DATA_ERROR;for(t.sourceIndex+=4,s=e;s;--s)t.dest[t.destIndex]=t.source[t.sourceIndex++];return t.bitcount=0,this.OK},this.inflate_fixed_block=function(t){return this.inflate_block_data(t,this.sltree,this.sdtree)},this.inflate_dynamic_block=function(t){return this.decode_trees(t,t.ltree,t.dtree),this.inflate_block_data(t,t.ltree,t.dtree)},this.init=function(){this.build_fixed_trees(this.sltree,this.sdtree),this.build_bits_base(this.length_bits,this.length_base,4,3),this.build_bits_base(this.dist_bits,this.dist_base,2,1),this.length_bits[28]=0,this.length_base[28]=258},this.uncompress=function(t,e,s){var i,r=new this.DATA(this);r.source=t,r.sourceIndex=e,r.bitcount=0,r.dest=new Uint8Array(s),r.destIndex=0;do{var n;switch(i=this.getbit(r),this.read_bits(r,2,0)){case 0:n=this.inflate_uncompressed_block(r);break;case 1:n=this.inflate_fixed_block(r);break;case 2:n=this.inflate_dynamic_block(r);break;default:return{status:this.DATA_ERROR}}if(n!=this.OK)return{status:this.DATA_ERROR}}while(!i);return{status:this.OK,data:r.dest}}}
/**
* PUZ reading/writing functions

* Parts of this code from xroz
* xroz - play crosswords within your browser
* Author: Alex Stangl  8/14/2011
* Copyright 2011, Alex Stangl. All Rights Reserved.
* Licensed under ISC license (see LICENSE file)
* https://github.com/astangl/xroz/blob/master/LICENSE

* Other parts from Confuzzle
* Copyright (c) 2020 Rowan Katekar
* https://github.com/rjkat/confuzzle
* MIT license

* Remainder of this code (c) 2016-2021 Alex Boisvert
* licensed under MIT license
* https://opensource.org/licenses/MIT
**/

/*jslint browser: true, bitwise: true, plusplus: true */
var ActiveXObject, parsedPuz, filecontents, PUZAPP = {};
(function () {
    "use strict";

    // return whether browser supports local storage
    function supportsLocalStorage() {
        try {
            return window.localStorage !== undefined && window.localStorage !== null;
        } catch (e) {
            return false;
        }
    }

    // Conditionally convert to UTF-8 (based on .puz version)
    function StringConverter(version) {
        if (version.startsWith('1.')) { // iso-8859-1
            return function(x) {return x;}
        }
        else {
            return function(x) {return BinaryStringToUTF8String(x);}
        }
    }

    // get a binary byte from a string (bytes) at position offset
    function getByte(bytes, offset) {
        return bytes.charCodeAt(offset) % 256;
    }

    // pop items from end of array adding them to accumulator until either
    // array exhausted or next element from array would cause accumulator to exceed threshold
    // returns accumulator. arr is destructively modified, reflecting all the pops.
    function popWhileLessThanOrEqual(threshold, arr) {
        var acc = 0, l;
        for (l = arr.length - 1; l >= 0 && arr[l] + acc <= threshold; --l) {
            acc += arr.pop();
        }
        return acc;
    }

    // return sum of all numbers in array
    function sumArray(arr) {
        var acc = 0, i;
        for (i = 0; i < arr.length; ++i) {
            acc += arr[i];
        }
        return acc;
    }

    // return index of first occurrence of specified element in array, or -1 if not found
    function findInArray(arr, element) {
        var i;
        for (i = 0; i < arr.length; ++i) {
            if (arr[i] === element) {
                return i;
            }
        }
        return -1;
    }

    function Puz() {
        // define symbolic constants
        this.DIRECTION_ACROSS = 1;
        this.DIRECTION_DOWN = -1;
        this.DIRECTION_UNKNOWN = 0;

        // immutable fields (unchanged after initialization): CONSTANTS, solution, url,
        //      supportsLocalStorage, width, height, gext, acrossWordNbrs, downWordNbrs,
        //      padding (for now), sqNbrs, strings, canv, minPixmult
        //      version, nbrClues, acrossClues, downClues, leftContainer, rightContainer
        //      acrossSqNbrs, downSqNbrs
        //      NEW: also now GRBS and RTBL
        // mutable fields: cursorX, cursorY, grid, pixmult, direction, revealSolution,
        //      highlightWordNbr, showingHelp,
        //      direction, highlightWordExtent, highlightClueId, lastClickX, lastClickY

        // return key for putting state into local storage
        this.storageKey = function () {
            return "xroz." + this.url + ".state";
        };

        this.innerHeight = function () {
            return document.getElementsByTagName("html")[0].clientHeight - this.BODY_MARGIN * 2;
        };
        this.innerWidth = function () {
            return document.getElementsByTagName("html")[0].clientWidth - this.BODY_MARGIN * 2;
        };
        this.toIndex = function (x, y) {
            return y * this.width + x;
        };
        this.fromIndex = function (index) {
            return [index % this.width, Math.floor(index / this.width)];
        };
        this.isBlack = function (x, y) {
            return this.solution.charAt(this.toIndex(x, y)) === '.';
        };
        this.cursorBlack = function () {
            return this.isBlack(this.cursorX, this.cursorY);
        };
        this.circled = function (index) {
            return this.gext !== undefined && (getByte(this.gext, index) & 0x80) !== 0;
        };
        this.startDownWord = function (x, y) {
            return (y === 0 || this.isBlack(x, y - 1)) && y < this.height - 1 && !this.isBlack(x, y) && !this.isBlack(x, y + 1);
        };
        this.startAcrossWord = function (x, y) {
            return (x === 0 || this.isBlack(x - 1, y)) && x < this.width - 1 && !this.isBlack(x, y) && !this.isBlack(x + 1, y);
        };

        // return word associated with (x,y) based upon current direction, or 0 if N/A
        this.getWordNbr = function (x, y) {
            var direction = this.direction,
            index = this.toIndex(x, y);
            if (direction === this.DIRECTION_UNKNOWN) {
                return 0;
            }
            return direction === this.DIRECTION_ACROSS ? this.acrossWordNbrs[index] : this.downWordNbrs[index];
        };

        // store flag indicating whether browser supports local storage.
        //TODO this may be a premature optimization; figure out whether caching this is really worthwhile
        this.supportsLocalStorage = supportsLocalStorage();
    }

    function getShort(bytes, offset) {
        return getByte(bytes, offset) + getByte(bytes, offset + 1) * 256;
    }

    function cksum_region(bytes, base, len, cksum) {
        var i;
        for (i = 0; i < len; ++i) {
            if (cksum % 2) {
                cksum = (cksum - 1) / 2 + 0x8000;
            } else {
                cksum /= 2;
            }
            cksum += getByte(bytes, base + i);
        }

        return cksum;
    }

    // return offset of nth occurrence of myChar
    function findOffsetOfNth(bytes, startOffset, myChar, n) {
        var offset = startOffset;
        while (n > 0) {
            if (bytes[offset++] === myChar) {
                n--;
            }
        }
        return offset;
    }

    function parsePuz(bytes) {
        //TODO check checksums
		var sanity_check = bytes.match('ACROSS&DOWN');
		if (!sanity_check)
		{
			console.log('Not a .puz file!');
			throw {
                name: "BADMAGICNUMBER",
                message: "File did not contain expected magic number, contained '" + filemagic + "'."
            };
		}
        var retval = new Puz(),
        filemagic = bytes.substring(2, 14),
            //filechecksum = getShort(bytes, 0),
            c_cib = cksum_region(bytes, 44, 8, 0),
            w = getByte(bytes, 44),
                h = getByte(bytes, 45),
                wh = w * h,
				grid_offset = 52 + wh,
				strings_offset = grid_offset + wh,
				cksum = cksum_region(bytes, 52, wh, c_cib),
				nbrClues = getShort(bytes, 46),
				extra_offset = findOffsetOfNth(bytes, strings_offset, '\u0000', nbrClues + 4),
				offset = extra_offset,
				sqNbr = 1,
				sqNbrString,
				clueNum = 0,
				index = 0,
				acrossClues = [],
				downClues = [],
				sqNbrs = [],
				downWordNbrs = [],
				acrossWordNbrs = [],
				acrossSqNbrs = [],
				downSqNbrs = [],
				sectName,
				len,
				chksum,
				compChksum,
				x,
				y,
				saw,
				sdw,
				isBlack;
        if (filemagic !== "ACROSS&DOWN\u0000") {
			console.log('Not a .puz file!');
            throw {
                name: "BADMAGICNUMBER",
                message: "File did not contain expected magic number, contained '" + filemagic + "'."
            };
        }
        retval.version = bytes.substring(24, 27);
        var string_convert = StringConverter(retval.version);

        retval.width = w;
        retval.height = h;
        retval.nbrClues = nbrClues;
        retval.solution = string_convert(bytes.substring(52, 52 + wh));
        retval.strings = bytes.substring(strings_offset).split('\u0000', nbrClues + 4).map(string_convert);
        retval.grid = string_convert(bytes.substring(grid_offset, grid_offset + wh));
        // Replace "solution" with "grid" if the puzzle is filled
        if (retval.grid.indexOf('-') == -1)
        {
            retval.solution = retval.grid;
        }
        cksum = cksum_region(bytes, grid_offset, wh, cksum);
        var acrossWords = {}, downWords = {};
        for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++, index++) {
                sdw = retval.startDownWord(x, y);
                saw = retval.startAcrossWord(x, y);
                sqNbrString = sqNbr.toString();
                sqNbrs.push(sdw || saw ? sqNbrString : "");
                isBlack = retval.isBlack(x, y);
                downWordNbrs.push(sdw ? sqNbr : isBlack || y === 0 ? 0 : downWordNbrs[index - w]);
                acrossWordNbrs.push(saw ? sqNbr : isBlack || x === 0 ? 0 : acrossWordNbrs[index - 1]);
                if (sdw || saw) {
                    if (saw) {
                        acrossClues.push(sqNbr);
                        acrossClues.push(clueNum++);
                        acrossSqNbrs.push(sqNbr);
                    }
                    if (sdw) {
                        downClues.push(sqNbr);
                        downClues.push(clueNum++);
                        downSqNbrs.push(sqNbr);
                    }
                    sqNbr++;
                }
            }
        }
        retval.acrossClues = acrossClues;
        retval.downClues = downClues;
        retval.sqNbrs = sqNbrs;
        retval.acrossWordNbrs = acrossWordNbrs;
        retval.downWordNbrs = downWordNbrs;
        retval.acrossSqNbrs = acrossSqNbrs;
        retval.downSqNbrs = downSqNbrs;
        while (offset < bytes.length) {
            sectName = bytes.substring(offset, offset + 4);
            len = getShort(bytes, offset + 4);
            chksum = getShort(bytes, offset + 6);
            compChksum = cksum_region(bytes, offset + 8, len, 0);
            /*
            if (chksum !== compChksum) {
                throw {
                    name: "BadExtraSectionChecksum",
                    message: "Extra section " + sectName + " had computed checksum " + compChksum + ", versus given checksum " + chksum
                };
            }
            */
            if (sectName === "GEXT") {
                retval.gext = bytes.substring(offset + 8, offset + 8 + len);
            }
            if (sectName === "GRBS") {
                retval.grbs = bytes.substring(offset + 8, offset + 8 + len);
            }
            if (sectName === "RTBL") {
                retval.rtbl = bytes.substring(offset + 8, offset + 8 + len);
            }
            offset += len + 9;
            //console.log("Extra section " + sectName);
        }
        // Now I'm going to add in some more info, explicitly
        // pulling the clues and entries
        retval.title = retval.strings[0];
        retval.author = retval.strings[1];
        retval.copyright = retval.strings[2];
        var all_clues = retval.strings.slice(3,3+retval.nbrClues);
        var across_entries = {}; var down_entries = {};
        var across_clues = {}; var down_clues = {};
        var clues_remaining = retval.nbrClues;
        var across_clue_number = 0; var down_clue_number = 0;
        for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++, index++) {
                sdw = retval.startDownWord(x, y);
                saw = retval.startAcrossWord(x, y);
                isBlack = retval.isBlack(x, y);
                var this_index = retval.toIndex(x,y);
                if (saw)
                {
                    // Start of an across entry
                    // Grab the number
                    across_clue_number = acrossWordNbrs[this_index];
                    // Add the clue
                    across_clues[across_clue_number] = all_clues[0];
                    clues_remaining--;
                    all_clues = all_clues.slice(1,1+clues_remaining);
                    // Start the entry
                    across_entries[across_clue_number] = retval.solution[this_index];
                }
                else if (!isBlack && acrossWordNbrs[this_index] !== 0)
                {
                    across_entries[across_clue_number] += retval.solution[this_index];
                }
                if (sdw)
                {
                    // Start of a down entry
                    // Grab the number
                    down_clue_number = downWordNbrs[this_index];
                    // Add the clue
                    down_clues[down_clue_number] = all_clues[0];
                    clues_remaining--;
                    all_clues = all_clues.slice(1,1+clues_remaining);
                }
            }
        }
        // Check for a notepad
        var additional_clues = retval.strings.slice(3+retval.nbrClues,4+retval.nbrClues);
        retval.notes = '';
        if (additional_clues[0])
        {
            retval.notes = additional_clues[0];
        }
        retval.circles = [];
        // Down entries.  Also circles
        for (x = 0; x < w; x++) {
            for (y = 0; y < h; y++) {
                sdw = retval.startDownWord(x, y);
                isBlack = retval.isBlack(x, y);
                var this_index = retval.toIndex(x,y);
                if (sdw)
                {
                    down_clue_number = downWordNbrs[this_index];
                    // Start the entry
                    down_entries[down_clue_number] = retval.solution[this_index];
                }
                else if (!isBlack && downWordNbrs[this_index] !== 0)
                {
                    down_entries[down_clue_number] += retval.solution[this_index];
                }
                retval.circles[this_index] = retval.circled(this_index);
            }
        }
        retval.across_entries = across_entries;
        retval.across_clues = across_clues;
        retval.down_clues = down_clues;
        retval.down_entries = down_entries;

        // All entries
		var all_entries = [];
		var obj, mynum;
		for (x=0; x<w; x++) {
			for (y=0; y<h; y++) {
				var myindex = retval.toIndex(x, y);
				if (retval.startAcrossWord(x,y)) {
					mynum = retval.acrossWordNbrs[myindex];
					obj = {};
					obj['Number'] = mynum;
					obj['Direction'] = 'Across';
					obj['Clue'] = across_clues[mynum];
					obj['Entry'] = across_entries[mynum];
					obj['x'] = x;
					obj['y'] = y;
					obj['Grid_Order'] = retval.toIndex(x, y);
					all_entries.push(obj);
				}
				if (retval.startDownWord(x,y)) {
					mynum = retval.downWordNbrs[myindex];
					obj = {};
					obj['Number'] = mynum;
					obj['Direction'] = 'Down';
					obj['Clue'] = down_clues[mynum];
					obj['Entry'] = down_entries[mynum];
					obj['x'] = x;
					obj['y'] = y;
					obj['Grid_Order'] = retval.toIndex(x, y);
					all_entries.push(obj);
				}
			}
		}
		retval.all_entries = all_entries;

		PUZAPP.puzdata = retval;

        return retval;
    }

    function is_in_array(arr,obj)
    {
        return (arr.indexOf(obj) != -1);
    }

	function puzdata(filecontents)
	{
		var parsedPuz = parsePuz(filecontents);
		// Add in any additional data we may want
		return parsedPuz;
	}

    PUZAPP.parsepuz = parsePuz;

}());

/**
 * For writing PUZ files
 * https://github.com/rjkat/anagrind/blob/master/client/js/puz.js
 * Released under MIT License
 * https://opensource.org/licenses/MIT
**/

// Strings in puz files are ISO-8859-1.

// From https://www.i18nqa.com/debug/table-iso8859-1-vs-windows-1252.html:
// ISO-8859-1 (also called Latin-1) is identical to Windows-1252 (also called CP1252)
// except for the code points 128-159 (0x80-0x9F). ISO-8859-1 assigns several control
// codes in this range. Windows-1252 has several characters, punctuation, arithmetic
// and business symbols assigned to these code points.
const PUZ_ENCODING = "windows-1252";

const PUZ_HEADER_CONSTANTS = {
    offsets: {
        FILE_CHECKSUM: 0x00,
        MAGIC: 0x02,
        HEADER_CHECKSUM: 0x0E,
        ICHEATED_CHECKSUM: 0x10,
        VERSION: 0x18,
        RES1: 0x1C,
        SCRAMBLED_CHECKSUM: 0x1E,
        RES2: 0x20,
        WIDTH: 0x2C,
        HEIGHT: 0x2D,
        NUM_CLUES: 0x2E,
        UNKNOWN_BITMASK: 0x30,
        SCRAMBLED_TAG: 0x32,
    },
    lengths: {
        MAGIC: 0x0B,
        VERSION: 0x04,
        ICHEATED_CHECKSUM: 0x08,
        RES2: 0x0C,
        HEADER: 0x34
    },
};

// names of string fields
const PUZ_STRING_FIELDS = ['title', 'author', 'copyright'];

// http://code.google.com/p/puz/wiki/FileFormat
// https://github.com/tedtate/puzzler/blob/master/lib/crossword.js
function readHeader(buf) {
    const i = PUZ_HEADER_CONSTANTS.offsets;
    const n = PUZ_HEADER_CONSTANTS.lengths;
    return {
        FILE_CHECKSUM: buf.readUInt16LE(i.FILE_CHECKSUM),
        MAGIC: buf.toString('utf8', i.MAGIC, i.MAGIC + n.MAGIC),
        HEADER_CHECKSUM: buf.readUInt16LE(i.HEADER_CHECKSUM),
        ICHEATED_CHECKSUM: buf.toString('hex', i.ICHEATED_CHECKSUM, i.ICHEATED_CHECKSUM + n.ICHEATED_CHECKSUM),
        VERSION: buf.toString('utf8', i.VERSION, i.VERSION + n.VERSION),
        RES1: buf.readUInt16LE(i.RES1),
        SCRAMBLED_CHECKSUM: buf.readUInt16LE(i.SCRAMBLED_CHECKSUM),
        RES2: buf.toString('hex', i.RES2, i.RES2 + n.RES2),
        WIDTH: buf.readUInt8(i.WIDTH),
        HEIGHT: buf.readUInt8(i.HEIGHT),
        NUM_CLUES: buf.readUInt16LE(i.NUM_CLUES),
        UNKNOWN_BITMASK: buf.readUInt16LE(i.UNKNOWN_BITMASK),
        SCRAMBLED_TAG: buf.readUInt16LE(i.SCRAMBLED_TAG)
    }
}

// My windows-1252 encoding function which probably doesn't work?
function windows1252_encode(s) {
    var ret = new Uint8Array(s.length);
    for (var i=0; i<s.length; i++) {
        ret[i] = s.charCodeAt(i);
    }
    return ret;
}

function puzEncode(s, encoding) {
    if (!encoding) {
        encoding = PUZ_ENCODING;
    }
    //const encoder = new TextEncoder();
    //return encoder.encode(s);
    return windows1252_encode(s);
    //return iconv.encode(s);
}

// http://blog.tatedavies.com/2012/08/28/replace-microsoft-chars-in-javascript/
/**
 * Replace Word characters with Ascii equivalent
 **/
function replaceWordChars(text) {
    var s = text;
    // smart single quotes and apostrophe
    s = s.replace(/[\u2018|\u2019|\u201A]/g, "\'");
    // smart double quotes
    s = s.replace(/[\u201C|\u201D|\u201E]/g, "\"");
    // ellipsis
    s = s.replace(/\u2026/g, "...");
    // dashes
    s = s.replace(/[\u2013|\u2014]/g, "-");
    // circumflex
    s = s.replace(/\u02C6/g, "^");
    // open angle bracket
    s = s.replace(/\u2039/g, "");
    // spaces
    s = s.replace(/[\u02DC|\u00A0]/g, " ");
    return s;
}


function puzDecode(buf, start, end, encoding) {
    if (!encoding) {
        encoding = PUZ_ENCODING;
    }
    // TODO: this is also UTF-8
    const decoder = new TextDecoder();
    const s = decoder.decode(buf.slice(start, end));
    //const s = iconv.decode(buf.slice(start, end), encoding);
    return replaceWordChars(s);
}

function splitNulls(buf, encoding) {
    let i = 0;
    let prev = 0;
    let parts = [];
    while (i < buf.length) {
        if (buf[i] === 0x0) {
            parts.push(puzDecode(buf, prev, i, encoding));
            prev = i + 1;
        }
        i++;
    }
    if (i > prev)
        parts.push(puzDecode(buf, prev, i, encoding));
    return parts;
}

function checksum(base, c, len) {
  if (c === undefined)
    c = 0x0000;

  if (base === undefined)
    return c;

  if (len === undefined)
    len = base.length;

  for (let i = 0; i < len; i++) {
    if (c & 0x0001)
      c = ((c >>> 1) + 0x8000) & 0xFFFF;
    else
      c = (c >>> 1);
    c = (c + base[i]) & 0xFFFF;
  }
  return c;
}

function concatBytes(a, b) {
    let c = new Uint8Array(a.length + b.length);
    c.set(a);
    c.set(b, a.length);
    return c;
}

function writeCheatChecksum(buf, offset, key, checksums) {
    const n = checksums.length;
    for (let shift = 0; shift < 2; shift++) {
        for (let i = 0; i < checksums.length; i++) {
            const c = (checksums[i] & (0xFF << 8*shift)) >>> 8*shift;
            buf[offset + i + n*shift] = key.charCodeAt(i + n*shift) ^ c;
        }
    }
}

function writeUInt16LE(buf, offset, val) {
    buf[offset + 0] =  val & 0x00FF;
    buf[offset + 1] = (val & 0xFF00) >> 8;
}

class PuzPayload {
    static from(x, encoding) {
        const buf = Buffer.from(x);
        let header = readHeader(buf);
        const ncells = header.WIDTH * header.HEIGHT;
        let pos = PUZ_HEADER_CONSTANTS.lengths.HEADER;
        const solution = puzDecode(buf, pos, pos + ncells, encoding);
        pos += ncells;
        const state = puzDecode(buf, pos, pos + ncells, encoding);
        pos += ncells;
        const strings = splitNulls(buf.slice(pos), encoding);
        const fields = PUZ_STRING_FIELDS;
        const meta = {};
        fields.forEach(function(f, i) {
            meta[f] = strings[i];
        });
        meta.note = strings[fields.length + header.NUM_CLUES];
        meta.width = header.WIDTH;
        meta.height = header.HEIGHT;
        const clues = strings.slice(fields.length, fields.length + header.NUM_CLUES);
        return new PuzPayload(meta, clues, solution, state);
    }

    buildStrings() {
        let strings = '';
        const fields = PUZ_STRING_FIELDS;
        for (let i = 0; i < fields.length; i++)
            strings += this[fields[i]] + '\x00';

        for (let i = 0; i < this.clues.length; i++)
            strings += this.clues[i] + '\x00';

        if (this.note) {
            strings += this.note + '\x00';
        } else {
            strings += '\x00';
        }


        return puzEncode(strings);
    }

    stringsChecksum(c) {
        c = checksum(puzEncode(this.title + '\x00'), c);
        c = checksum(puzEncode(this.author + '\x00'), c);
        c = checksum(puzEncode(this.copyright + '\x00'), c);
        for (let i = 0; i < this.clues.length; i++)
            c = checksum(puzEncode(this.clues[i]), c);

        if (this.note)
            c = checksum(puzEncode(this.note + '\x00'), c);
        return c;
    }

    buildBody() {
        let body = puzEncode(this.solution);
        body = concatBytes(body, puzEncode(this.state));
        return concatBytes(body, this.buildStrings());
    }

    computeChecksums(header) {
        const p = PUZ_HEADER_CONSTANTS;
        const h = checksum(header.slice(p.offsets.WIDTH, p.lengths.HEADER));
        let c = checksum(puzEncode(this.solution), h);
        c = checksum(puzEncode(this.state), c);
        return {
            header: h,
            solution: checksum(puzEncode(this.solution)),
            state: checksum(puzEncode(this.state)),
            strings: this.stringsChecksum(),
            file: this.stringsChecksum(c)
        }
    }

    buildHeader() {
        const i = PUZ_HEADER_CONSTANTS.offsets;
        const header = new Uint8Array(PUZ_HEADER_CONSTANTS.lengths.HEADER);

        const encoder = new TextEncoder();

        // metadata
        header.set(encoder.encode("ACROSS&DOWN"), i.MAGIC);
        header.set(encoder.encode("1.3"), i.VERSION);
        //header.set(iconv.encode("ACROSS&DOWN", "utf-8"), i.MAGIC);
        //header.set(iconv.encode("1.3", "utf-8"), i.VERSION);

        // dimensions
        header[i.WIDTH] = this.width;
        header[i.HEIGHT] = this.height;
        writeUInt16LE(header, i.NUM_CLUES, this.clues.length);

        // magical random bitmask, causes across lite to crash if not set :S
        header[i.UNKNOWN_BITMASK] = 0x01;

        // checksums
        const c = this.computeChecksums(header);
        writeUInt16LE(header, i.FILE_CHECKSUM, c.file);
        writeUInt16LE(header, i.HEADER_CHECKSUM, c.header);
        writeCheatChecksum(header, i.ICHEATED_CHECKSUM, "ICHEATED", [
            c.header, c.solution, c.state, c.strings
        ]);
        return header;
    }

    toBytes() {
        return concatBytes(this.buildHeader(), this.buildBody());
    }

    toBuffer() {
        return Buffer.from(this.toBytes());
    }

    /* state is optional */
    constructor(metadata, clues, solution, state) {
        for (let [field, value] of Object.entries(metadata)) {
            this[field] = value;
        }
        this.clues = clues;
        this.solution = solution;
        this.state = state;
        if (!this.state)
            this.state = this.solution.replace(/[^\.]/g, '-');
    }
}


/** Function to create a PuzPayload from a PUZAPP **/
function puzapp_to_puzpayload(puzdata) {
    var meta = {
        title: puzdata.title,
        author: puzdata.author,
        copyright: puzdata.copyright,
        note: puzdata.notes,
        width: puzdata.width,
        height: puzdata.height,
    }
    var pp_clues = [];
    // Sort the entries by number then direction
    puzdata.all_entries.sort(function(x, y) {
       if (x.Number < y.Number) {
           return -1;
       } else if (x.Number > y.Number) {
           return 1;
       }
       else {
           if (x.Direction < y.Direction) {
               return -1;
           } else if (x.Direction > y.Direction) {
               return 1;
           }
       }
       return 0;
    });
    for (var i=0; i<puzdata.all_entries.length; i++) {
        pp_clues.push(puzdata.all_entries[i].Clue);
    }
    return new PuzPayload(meta, pp_clues, puzdata.solution, puzdata.grid);
}

/** Download puzdata as a .puz file **/
//function puz_download(puzdata, outname) {
//    const puzpayload = puzapp_to_puzpayload(puzdata);
//    file_download(puzpayload.toBytes(), outname, 'application/octet-stream');
//}

/** Create a JSCrossword from a PUZAPP **/
function jscrossword_from_puz(puzdata) {
    console.log(puzdata);
    /* metadata */
    var metadata = {
      "title": puzdata.title.trim()
    , "author": puzdata.author.trim()
    , "copyright": puzdata.copyright.trim()
    , "description": puzdata.notes.trim()
    , "height": puzdata.height
    , "width": puzdata.width
    , "crossword_type": "crossword"
    }

    /* Rebus table (if needed) */
    var rebus_table = {};
    if (puzdata.rtbl) {
      var rtbl_arr = puzdata.rtbl.split(';')
      rtbl_arr.forEach(function (x) {
        if (x.includes(':')) {
          var thisArr = x.split(':');
          rebus_table[Number(thisArr[0])] = thisArr[1];
        }
      });
    }

    /* cells */
    var cells = [];
    var i, j;
    for (j=0; j < puzdata.height; j++) {
        for (i=0; i < puzdata.width; i++) {
            var cell = {"x": i, "y": j};
            var ix = xw_ij_to_index(i, j, puzdata.width);
            var this_letter = puzdata.solution.charAt(ix);
            if (this_letter == ".") {
                cell['type'] = 'block';
            }
            else {
                cell['solution'] = this_letter;
            }
            // already filled-in letters
            var this_fill = puzdata.grid.charAt(ix);
            if (this_fill !== '-' && this_fill !== '.') {
              cell['letter'] = this_fill;
            }

            if (puzdata.sqNbrs[ix]) {
                cell['number'] = puzdata.sqNbrs[ix];
            }
            // circles
            if (puzdata.gext) {
                if (puzdata.gext[ix] != "\u0000") {
                  cell['background-shape'] = 'circle';
                }
            }
            // rebus
            if (puzdata.grbs) {
                cell['solution'] = rebus_table[puzdata.grbs[ix].charCodeAt(0) - 1] || this_letter;
            }
            cells.push(cell);
        }
    }
    /* words and clues */
    var word_id = 1;
    var words = [];
    var clues = [];
    // across words
    var across_clues = [];
    Object.keys(puzdata.across_entries).forEach(clue_number => {
        var this_word = puzdata.across_entries[clue_number];
        var word = {"id": word_id};
        var word_indexes = puzdata.acrossWordNbrs.reduce(function(a, e, i) {
            if (e == clue_number) {
                a.push(i);
            }
            return a;
        }, []);
        var word_cells = word_indexes.map(e => xw_index_to_ij(e, puzdata.width));
        word['cells'] = word_cells;
        words.push(word);
        across_clues.push({"text": puzdata.across_clues[clue_number], "word": word_id, "number": clue_number});
        word_id = word_id + 1;
    });
    clues.push({"title": "ACROSS", "clue": across_clues});
    // down words
    var down_clues = [];
    Object.keys(puzdata.down_entries).forEach(clue_number => {
        var this_word = puzdata.down_entries[clue_number];
        var word = {"id": word_id};
        var word_indexes = puzdata.downWordNbrs.reduce(function(a, e, i) {
            if (e == clue_number) {
                a.push(i);
            }
            return a;
        }, []);
        var word_cells = word_indexes.map(e => xw_index_to_ij(e, puzdata.width));
        word['cells'] = word_cells;
        words.push(word);
        down_clues.push({"text": puzdata.down_clues[clue_number], "word": word_id, "number": clue_number});
        word_id = word_id + 1;
    });
    clues.push({"title": "DOWN", "clue": down_clues});

    return new JSCrossword(metadata, cells, words, clues);
}


/**
 * @license
 * Lodash <https://lodash.com/>
 * Copyright OpenJS Foundation and other contributors <https://openjsf.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */
(function(){function n(n,t,r){switch(r.length){case 0:return n.call(t);case 1:return n.call(t,r[0]);case 2:return n.call(t,r[0],r[1]);case 3:return n.call(t,r[0],r[1],r[2])}return n.apply(t,r)}function t(n,t,r,e){for(var u=-1,i=null==n?0:n.length;++u<i;){var o=n[u];t(e,o,r(o),n)}return e}function r(n,t){for(var r=-1,e=null==n?0:n.length;++r<e&&t(n[r],r,n)!==!1;);return n}function e(n,t){for(var r=null==n?0:n.length;r--&&t(n[r],r,n)!==!1;);return n}function u(n,t){for(var r=-1,e=null==n?0:n.length;++r<e;)if(!t(n[r],r,n))return!1;
    return!0}function i(n,t){for(var r=-1,e=null==n?0:n.length,u=0,i=[];++r<e;){var o=n[r];t(o,r,n)&&(i[u++]=o)}return i}function o(n,t){return!!(null==n?0:n.length)&&y(n,t,0)>-1}function f(n,t,r){for(var e=-1,u=null==n?0:n.length;++e<u;)if(r(t,n[e]))return!0;return!1}function c(n,t){for(var r=-1,e=null==n?0:n.length,u=Array(e);++r<e;)u[r]=t(n[r],r,n);return u}function a(n,t){for(var r=-1,e=t.length,u=n.length;++r<e;)n[u+r]=t[r];return n}function l(n,t,r,e){var u=-1,i=null==n?0:n.length;for(e&&i&&(r=n[++u]);++u<i;)r=t(r,n[u],u,n);
    return r}function s(n,t,r,e){var u=null==n?0:n.length;for(e&&u&&(r=n[--u]);u--;)r=t(r,n[u],u,n);return r}function h(n,t){for(var r=-1,e=null==n?0:n.length;++r<e;)if(t(n[r],r,n))return!0;return!1}function p(n){return n.split("")}function _(n){return n.match($t)||[]}function v(n,t,r){var e;return r(n,function(n,r,u){if(t(n,r,u))return e=r,!1}),e}function g(n,t,r,e){for(var u=n.length,i=r+(e?1:-1);e?i--:++i<u;)if(t(n[i],i,n))return i;return-1}function y(n,t,r){return t===t?Z(n,t,r):g(n,b,r)}function d(n,t,r,e){
    for(var u=r-1,i=n.length;++u<i;)if(e(n[u],t))return u;return-1}function b(n){return n!==n}function w(n,t){var r=null==n?0:n.length;return r?k(n,t)/r:Cn}function m(n){return function(t){return null==t?X:t[n]}}function x(n){return function(t){return null==n?X:n[t]}}function j(n,t,r,e,u){return u(n,function(n,u,i){r=e?(e=!1,n):t(r,n,u,i)}),r}function A(n,t){var r=n.length;for(n.sort(t);r--;)n[r]=n[r].value;return n}function k(n,t){for(var r,e=-1,u=n.length;++e<u;){var i=t(n[e]);i!==X&&(r=r===X?i:r+i);
    }return r}function O(n,t){for(var r=-1,e=Array(n);++r<n;)e[r]=t(r);return e}function I(n,t){return c(t,function(t){return[t,n[t]]})}function R(n){return n?n.slice(0,H(n)+1).replace(Lt,""):n}function z(n){return function(t){return n(t)}}function E(n,t){return c(t,function(t){return n[t]})}function S(n,t){return n.has(t)}function W(n,t){for(var r=-1,e=n.length;++r<e&&y(t,n[r],0)>-1;);return r}function L(n,t){for(var r=n.length;r--&&y(t,n[r],0)>-1;);return r}function C(n,t){for(var r=n.length,e=0;r--;)n[r]===t&&++e;
    return e}function U(n){return"\\"+Yr[n]}function B(n,t){return null==n?X:n[t]}function T(n){return Nr.test(n)}function $(n){return Pr.test(n)}function D(n){for(var t,r=[];!(t=n.next()).done;)r.push(t.value);return r}function M(n){var t=-1,r=Array(n.size);return n.forEach(function(n,e){r[++t]=[e,n]}),r}function F(n,t){return function(r){return n(t(r))}}function N(n,t){for(var r=-1,e=n.length,u=0,i=[];++r<e;){var o=n[r];o!==t&&o!==cn||(n[r]=cn,i[u++]=r)}return i}function P(n){var t=-1,r=Array(n.size);
    return n.forEach(function(n){r[++t]=n}),r}function q(n){var t=-1,r=Array(n.size);return n.forEach(function(n){r[++t]=[n,n]}),r}function Z(n,t,r){for(var e=r-1,u=n.length;++e<u;)if(n[e]===t)return e;return-1}function K(n,t,r){for(var e=r+1;e--;)if(n[e]===t)return e;return e}function V(n){return T(n)?J(n):_e(n)}function G(n){return T(n)?Y(n):p(n)}function H(n){for(var t=n.length;t--&&Ct.test(n.charAt(t)););return t}function J(n){for(var t=Mr.lastIndex=0;Mr.test(n);)++t;return t}function Y(n){return n.match(Mr)||[];
    }function Q(n){return n.match(Fr)||[]}var X,nn="4.17.21",tn=200,rn="Unsupported core-js use. Try https://npms.io/search?q=ponyfill.",en="Expected a function",un="Invalid `variable` option passed into `_.template`",on="__lodash_hash_undefined__",fn=500,cn="__lodash_placeholder__",an=1,ln=2,sn=4,hn=1,pn=2,_n=1,vn=2,gn=4,yn=8,dn=16,bn=32,wn=64,mn=128,xn=256,jn=512,An=30,kn="...",On=800,In=16,Rn=1,zn=2,En=3,Sn=1/0,Wn=9007199254740991,Ln=1.7976931348623157e308,Cn=NaN,Un=4294967295,Bn=Un-1,Tn=Un>>>1,$n=[["ary",mn],["bind",_n],["bindKey",vn],["curry",yn],["curryRight",dn],["flip",jn],["partial",bn],["partialRight",wn],["rearg",xn]],Dn="[object Arguments]",Mn="[object Array]",Fn="[object AsyncFunction]",Nn="[object Boolean]",Pn="[object Date]",qn="[object DOMException]",Zn="[object Error]",Kn="[object Function]",Vn="[object GeneratorFunction]",Gn="[object Map]",Hn="[object Number]",Jn="[object Null]",Yn="[object Object]",Qn="[object Promise]",Xn="[object Proxy]",nt="[object RegExp]",tt="[object Set]",rt="[object String]",et="[object Symbol]",ut="[object Undefined]",it="[object WeakMap]",ot="[object WeakSet]",ft="[object ArrayBuffer]",ct="[object DataView]",at="[object Float32Array]",lt="[object Float64Array]",st="[object Int8Array]",ht="[object Int16Array]",pt="[object Int32Array]",_t="[object Uint8Array]",vt="[object Uint8ClampedArray]",gt="[object Uint16Array]",yt="[object Uint32Array]",dt=/\b__p \+= '';/g,bt=/\b(__p \+=) '' \+/g,wt=/(__e\(.*?\)|\b__t\)) \+\n'';/g,mt=/&(?:amp|lt|gt|quot|#39);/g,xt=/[&<>"']/g,jt=RegExp(mt.source),At=RegExp(xt.source),kt=/<%-([\s\S]+?)%>/g,Ot=/<%([\s\S]+?)%>/g,It=/<%=([\s\S]+?)%>/g,Rt=/\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,zt=/^\w*$/,Et=/[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g,St=/[\\^$.*+?()[\]{}|]/g,Wt=RegExp(St.source),Lt=/^\s+/,Ct=/\s/,Ut=/\{(?:\n\/\* \[wrapped with .+\] \*\/)?\n?/,Bt=/\{\n\/\* \[wrapped with (.+)\] \*/,Tt=/,? & /,$t=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,Dt=/[()=,{}\[\]\/\s]/,Mt=/\\(\\)?/g,Ft=/\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g,Nt=/\w*$/,Pt=/^[-+]0x[0-9a-f]+$/i,qt=/^0b[01]+$/i,Zt=/^\[object .+?Constructor\]$/,Kt=/^0o[0-7]+$/i,Vt=/^(?:0|[1-9]\d*)$/,Gt=/[\xc0-\xd6\xd8-\xf6\xf8-\xff\u0100-\u017f]/g,Ht=/($^)/,Jt=/['\n\r\u2028\u2029\\]/g,Yt="\\ud800-\\udfff",Qt="\\u0300-\\u036f",Xt="\\ufe20-\\ufe2f",nr="\\u20d0-\\u20ff",tr=Qt+Xt+nr,rr="\\u2700-\\u27bf",er="a-z\\xdf-\\xf6\\xf8-\\xff",ur="\\xac\\xb1\\xd7\\xf7",ir="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",or="\\u2000-\\u206f",fr=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",cr="A-Z\\xc0-\\xd6\\xd8-\\xde",ar="\\ufe0e\\ufe0f",lr=ur+ir+or+fr,sr="['\u2019]",hr="["+Yt+"]",pr="["+lr+"]",_r="["+tr+"]",vr="\\d+",gr="["+rr+"]",yr="["+er+"]",dr="[^"+Yt+lr+vr+rr+er+cr+"]",br="\\ud83c[\\udffb-\\udfff]",wr="(?:"+_r+"|"+br+")",mr="[^"+Yt+"]",xr="(?:\\ud83c[\\udde6-\\uddff]){2}",jr="[\\ud800-\\udbff][\\udc00-\\udfff]",Ar="["+cr+"]",kr="\\u200d",Or="(?:"+yr+"|"+dr+")",Ir="(?:"+Ar+"|"+dr+")",Rr="(?:"+sr+"(?:d|ll|m|re|s|t|ve))?",zr="(?:"+sr+"(?:D|LL|M|RE|S|T|VE))?",Er=wr+"?",Sr="["+ar+"]?",Wr="(?:"+kr+"(?:"+[mr,xr,jr].join("|")+")"+Sr+Er+")*",Lr="\\d*(?:1st|2nd|3rd|(?![123])\\dth)(?=\\b|[A-Z_])",Cr="\\d*(?:1ST|2ND|3RD|(?![123])\\dTH)(?=\\b|[a-z_])",Ur=Sr+Er+Wr,Br="(?:"+[gr,xr,jr].join("|")+")"+Ur,Tr="(?:"+[mr+_r+"?",_r,xr,jr,hr].join("|")+")",$r=RegExp(sr,"g"),Dr=RegExp(_r,"g"),Mr=RegExp(br+"(?="+br+")|"+Tr+Ur,"g"),Fr=RegExp([Ar+"?"+yr+"+"+Rr+"(?="+[pr,Ar,"$"].join("|")+")",Ir+"+"+zr+"(?="+[pr,Ar+Or,"$"].join("|")+")",Ar+"?"+Or+"+"+Rr,Ar+"+"+zr,Cr,Lr,vr,Br].join("|"),"g"),Nr=RegExp("["+kr+Yt+tr+ar+"]"),Pr=/[a-z][A-Z]|[A-Z]{2}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,qr=["Array","Buffer","DataView","Date","Error","Float32Array","Float64Array","Function","Int8Array","Int16Array","Int32Array","Map","Math","Object","Promise","RegExp","Set","String","Symbol","TypeError","Uint8Array","Uint8ClampedArray","Uint16Array","Uint32Array","WeakMap","_","clearTimeout","isFinite","parseInt","setTimeout"],Zr=-1,Kr={};
    Kr[at]=Kr[lt]=Kr[st]=Kr[ht]=Kr[pt]=Kr[_t]=Kr[vt]=Kr[gt]=Kr[yt]=!0,Kr[Dn]=Kr[Mn]=Kr[ft]=Kr[Nn]=Kr[ct]=Kr[Pn]=Kr[Zn]=Kr[Kn]=Kr[Gn]=Kr[Hn]=Kr[Yn]=Kr[nt]=Kr[tt]=Kr[rt]=Kr[it]=!1;var Vr={};Vr[Dn]=Vr[Mn]=Vr[ft]=Vr[ct]=Vr[Nn]=Vr[Pn]=Vr[at]=Vr[lt]=Vr[st]=Vr[ht]=Vr[pt]=Vr[Gn]=Vr[Hn]=Vr[Yn]=Vr[nt]=Vr[tt]=Vr[rt]=Vr[et]=Vr[_t]=Vr[vt]=Vr[gt]=Vr[yt]=!0,Vr[Zn]=Vr[Kn]=Vr[it]=!1;var Gr={"\xc0":"A","\xc1":"A","\xc2":"A","\xc3":"A","\xc4":"A","\xc5":"A","\xe0":"a","\xe1":"a","\xe2":"a","\xe3":"a","\xe4":"a","\xe5":"a",
    "\xc7":"C","\xe7":"c","\xd0":"D","\xf0":"d","\xc8":"E","\xc9":"E","\xca":"E","\xcb":"E","\xe8":"e","\xe9":"e","\xea":"e","\xeb":"e","\xcc":"I","\xcd":"I","\xce":"I","\xcf":"I","\xec":"i","\xed":"i","\xee":"i","\xef":"i","\xd1":"N","\xf1":"n","\xd2":"O","\xd3":"O","\xd4":"O","\xd5":"O","\xd6":"O","\xd8":"O","\xf2":"o","\xf3":"o","\xf4":"o","\xf5":"o","\xf6":"o","\xf8":"o","\xd9":"U","\xda":"U","\xdb":"U","\xdc":"U","\xf9":"u","\xfa":"u","\xfb":"u","\xfc":"u","\xdd":"Y","\xfd":"y","\xff":"y","\xc6":"Ae",
    "\xe6":"ae","\xde":"Th","\xfe":"th","\xdf":"ss","\u0100":"A","\u0102":"A","\u0104":"A","\u0101":"a","\u0103":"a","\u0105":"a","\u0106":"C","\u0108":"C","\u010a":"C","\u010c":"C","\u0107":"c","\u0109":"c","\u010b":"c","\u010d":"c","\u010e":"D","\u0110":"D","\u010f":"d","\u0111":"d","\u0112":"E","\u0114":"E","\u0116":"E","\u0118":"E","\u011a":"E","\u0113":"e","\u0115":"e","\u0117":"e","\u0119":"e","\u011b":"e","\u011c":"G","\u011e":"G","\u0120":"G","\u0122":"G","\u011d":"g","\u011f":"g","\u0121":"g",
    "\u0123":"g","\u0124":"H","\u0126":"H","\u0125":"h","\u0127":"h","\u0128":"I","\u012a":"I","\u012c":"I","\u012e":"I","\u0130":"I","\u0129":"i","\u012b":"i","\u012d":"i","\u012f":"i","\u0131":"i","\u0134":"J","\u0135":"j","\u0136":"K","\u0137":"k","\u0138":"k","\u0139":"L","\u013b":"L","\u013d":"L","\u013f":"L","\u0141":"L","\u013a":"l","\u013c":"l","\u013e":"l","\u0140":"l","\u0142":"l","\u0143":"N","\u0145":"N","\u0147":"N","\u014a":"N","\u0144":"n","\u0146":"n","\u0148":"n","\u014b":"n","\u014c":"O",
    "\u014e":"O","\u0150":"O","\u014d":"o","\u014f":"o","\u0151":"o","\u0154":"R","\u0156":"R","\u0158":"R","\u0155":"r","\u0157":"r","\u0159":"r","\u015a":"S","\u015c":"S","\u015e":"S","\u0160":"S","\u015b":"s","\u015d":"s","\u015f":"s","\u0161":"s","\u0162":"T","\u0164":"T","\u0166":"T","\u0163":"t","\u0165":"t","\u0167":"t","\u0168":"U","\u016a":"U","\u016c":"U","\u016e":"U","\u0170":"U","\u0172":"U","\u0169":"u","\u016b":"u","\u016d":"u","\u016f":"u","\u0171":"u","\u0173":"u","\u0174":"W","\u0175":"w",
    "\u0176":"Y","\u0177":"y","\u0178":"Y","\u0179":"Z","\u017b":"Z","\u017d":"Z","\u017a":"z","\u017c":"z","\u017e":"z","\u0132":"IJ","\u0133":"ij","\u0152":"Oe","\u0153":"oe","\u0149":"'n","\u017f":"s"},Hr={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Jr={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'"},Yr={"\\":"\\","'":"'","\n":"n","\r":"r","\u2028":"u2028","\u2029":"u2029"},Qr=parseFloat,Xr=parseInt,ne="object"==typeof global&&global&&global.Object===Object&&global,te="object"==typeof self&&self&&self.Object===Object&&self,re=ne||te||Function("return this")(),ee="object"==typeof exports&&exports&&!exports.nodeType&&exports,ue=ee&&"object"==typeof module&&module&&!module.nodeType&&module,ie=ue&&ue.exports===ee,oe=ie&&ne.process,fe=function(){
    try{var n=ue&&ue.require&&ue.require("util").types;return n?n:oe&&oe.binding&&oe.binding("util")}catch(n){}}(),ce=fe&&fe.isArrayBuffer,ae=fe&&fe.isDate,le=fe&&fe.isMap,se=fe&&fe.isRegExp,he=fe&&fe.isSet,pe=fe&&fe.isTypedArray,_e=m("length"),ve=x(Gr),ge=x(Hr),ye=x(Jr),de=function p(x){function Z(n){if(cc(n)&&!bh(n)&&!(n instanceof Ct)){if(n instanceof Y)return n;if(bl.call(n,"__wrapped__"))return eo(n)}return new Y(n)}function J(){}function Y(n,t){this.__wrapped__=n,this.__actions__=[],this.__chain__=!!t,
    this.__index__=0,this.__values__=X}function Ct(n){this.__wrapped__=n,this.__actions__=[],this.__dir__=1,this.__filtered__=!1,this.__iteratees__=[],this.__takeCount__=Un,this.__views__=[]}function $t(){var n=new Ct(this.__wrapped__);return n.__actions__=Tu(this.__actions__),n.__dir__=this.__dir__,n.__filtered__=this.__filtered__,n.__iteratees__=Tu(this.__iteratees__),n.__takeCount__=this.__takeCount__,n.__views__=Tu(this.__views__),n}function Yt(){if(this.__filtered__){var n=new Ct(this);n.__dir__=-1,
    n.__filtered__=!0}else n=this.clone(),n.__dir__*=-1;return n}function Qt(){var n=this.__wrapped__.value(),t=this.__dir__,r=bh(n),e=t<0,u=r?n.length:0,i=Oi(0,u,this.__views__),o=i.start,f=i.end,c=f-o,a=e?f:o-1,l=this.__iteratees__,s=l.length,h=0,p=Hl(c,this.__takeCount__);if(!r||!e&&u==c&&p==c)return wu(n,this.__actions__);var _=[];n:for(;c--&&h<p;){a+=t;for(var v=-1,g=n[a];++v<s;){var y=l[v],d=y.iteratee,b=y.type,w=d(g);if(b==zn)g=w;else if(!w){if(b==Rn)continue n;break n}}_[h++]=g}return _}function Xt(n){
    var t=-1,r=null==n?0:n.length;for(this.clear();++t<r;){var e=n[t];this.set(e[0],e[1])}}function nr(){this.__data__=is?is(null):{},this.size=0}function tr(n){var t=this.has(n)&&delete this.__data__[n];return this.size-=t?1:0,t}function rr(n){var t=this.__data__;if(is){var r=t[n];return r===on?X:r}return bl.call(t,n)?t[n]:X}function er(n){var t=this.__data__;return is?t[n]!==X:bl.call(t,n)}function ur(n,t){var r=this.__data__;return this.size+=this.has(n)?0:1,r[n]=is&&t===X?on:t,this}function ir(n){
    var t=-1,r=null==n?0:n.length;for(this.clear();++t<r;){var e=n[t];this.set(e[0],e[1])}}function or(){this.__data__=[],this.size=0}function fr(n){var t=this.__data__,r=Wr(t,n);return!(r<0)&&(r==t.length-1?t.pop():Ll.call(t,r,1),--this.size,!0)}function cr(n){var t=this.__data__,r=Wr(t,n);return r<0?X:t[r][1]}function ar(n){return Wr(this.__data__,n)>-1}function lr(n,t){var r=this.__data__,e=Wr(r,n);return e<0?(++this.size,r.push([n,t])):r[e][1]=t,this}function sr(n){var t=-1,r=null==n?0:n.length;for(this.clear();++t<r;){
    var e=n[t];this.set(e[0],e[1])}}function hr(){this.size=0,this.__data__={hash:new Xt,map:new(ts||ir),string:new Xt}}function pr(n){var t=xi(this,n).delete(n);return this.size-=t?1:0,t}function _r(n){return xi(this,n).get(n)}function vr(n){return xi(this,n).has(n)}function gr(n,t){var r=xi(this,n),e=r.size;return r.set(n,t),this.size+=r.size==e?0:1,this}function yr(n){var t=-1,r=null==n?0:n.length;for(this.__data__=new sr;++t<r;)this.add(n[t])}function dr(n){return this.__data__.set(n,on),this}function br(n){
    return this.__data__.has(n)}function wr(n){this.size=(this.__data__=new ir(n)).size}function mr(){this.__data__=new ir,this.size=0}function xr(n){var t=this.__data__,r=t.delete(n);return this.size=t.size,r}function jr(n){return this.__data__.get(n)}function Ar(n){return this.__data__.has(n)}function kr(n,t){var r=this.__data__;if(r instanceof ir){var e=r.__data__;if(!ts||e.length<tn-1)return e.push([n,t]),this.size=++r.size,this;r=this.__data__=new sr(e)}return r.set(n,t),this.size=r.size,this}function Or(n,t){
    var r=bh(n),e=!r&&dh(n),u=!r&&!e&&mh(n),i=!r&&!e&&!u&&Oh(n),o=r||e||u||i,f=o?O(n.length,hl):[],c=f.length;for(var a in n)!t&&!bl.call(n,a)||o&&("length"==a||u&&("offset"==a||"parent"==a)||i&&("buffer"==a||"byteLength"==a||"byteOffset"==a)||Ci(a,c))||f.push(a);return f}function Ir(n){var t=n.length;return t?n[tu(0,t-1)]:X}function Rr(n,t){return Xi(Tu(n),Mr(t,0,n.length))}function zr(n){return Xi(Tu(n))}function Er(n,t,r){(r===X||Gf(n[t],r))&&(r!==X||t in n)||Br(n,t,r)}function Sr(n,t,r){var e=n[t];
    bl.call(n,t)&&Gf(e,r)&&(r!==X||t in n)||Br(n,t,r)}function Wr(n,t){for(var r=n.length;r--;)if(Gf(n[r][0],t))return r;return-1}function Lr(n,t,r,e){return ys(n,function(n,u,i){t(e,n,r(n),i)}),e}function Cr(n,t){return n&&$u(t,Pc(t),n)}function Ur(n,t){return n&&$u(t,qc(t),n)}function Br(n,t,r){"__proto__"==t&&Tl?Tl(n,t,{configurable:!0,enumerable:!0,value:r,writable:!0}):n[t]=r}function Tr(n,t){for(var r=-1,e=t.length,u=il(e),i=null==n;++r<e;)u[r]=i?X:Mc(n,t[r]);return u}function Mr(n,t,r){return n===n&&(r!==X&&(n=n<=r?n:r),
    t!==X&&(n=n>=t?n:t)),n}function Fr(n,t,e,u,i,o){var f,c=t&an,a=t&ln,l=t&sn;if(e&&(f=i?e(n,u,i,o):e(n)),f!==X)return f;if(!fc(n))return n;var s=bh(n);if(s){if(f=zi(n),!c)return Tu(n,f)}else{var h=zs(n),p=h==Kn||h==Vn;if(mh(n))return Iu(n,c);if(h==Yn||h==Dn||p&&!i){if(f=a||p?{}:Ei(n),!c)return a?Mu(n,Ur(f,n)):Du(n,Cr(f,n))}else{if(!Vr[h])return i?n:{};f=Si(n,h,c)}}o||(o=new wr);var _=o.get(n);if(_)return _;o.set(n,f),kh(n)?n.forEach(function(r){f.add(Fr(r,t,e,r,n,o))}):jh(n)&&n.forEach(function(r,u){
    f.set(u,Fr(r,t,e,u,n,o))});var v=l?a?di:yi:a?qc:Pc,g=s?X:v(n);return r(g||n,function(r,u){g&&(u=r,r=n[u]),Sr(f,u,Fr(r,t,e,u,n,o))}),f}function Nr(n){var t=Pc(n);return function(r){return Pr(r,n,t)}}function Pr(n,t,r){var e=r.length;if(null==n)return!e;for(n=ll(n);e--;){var u=r[e],i=t[u],o=n[u];if(o===X&&!(u in n)||!i(o))return!1}return!0}function Gr(n,t,r){if("function"!=typeof n)throw new pl(en);return Ws(function(){n.apply(X,r)},t)}function Hr(n,t,r,e){var u=-1,i=o,a=!0,l=n.length,s=[],h=t.length;
    if(!l)return s;r&&(t=c(t,z(r))),e?(i=f,a=!1):t.length>=tn&&(i=S,a=!1,t=new yr(t));n:for(;++u<l;){var p=n[u],_=null==r?p:r(p);if(p=e||0!==p?p:0,a&&_===_){for(var v=h;v--;)if(t[v]===_)continue n;s.push(p)}else i(t,_,e)||s.push(p)}return s}function Jr(n,t){var r=!0;return ys(n,function(n,e,u){return r=!!t(n,e,u)}),r}function Yr(n,t,r){for(var e=-1,u=n.length;++e<u;){var i=n[e],o=t(i);if(null!=o&&(f===X?o===o&&!bc(o):r(o,f)))var f=o,c=i}return c}function ne(n,t,r,e){var u=n.length;for(r=kc(r),r<0&&(r=-r>u?0:u+r),
    e=e===X||e>u?u:kc(e),e<0&&(e+=u),e=r>e?0:Oc(e);r<e;)n[r++]=t;return n}function te(n,t){var r=[];return ys(n,function(n,e,u){t(n,e,u)&&r.push(n)}),r}function ee(n,t,r,e,u){var i=-1,o=n.length;for(r||(r=Li),u||(u=[]);++i<o;){var f=n[i];t>0&&r(f)?t>1?ee(f,t-1,r,e,u):a(u,f):e||(u[u.length]=f)}return u}function ue(n,t){return n&&bs(n,t,Pc)}function oe(n,t){return n&&ws(n,t,Pc)}function fe(n,t){return i(t,function(t){return uc(n[t])})}function _e(n,t){t=ku(t,n);for(var r=0,e=t.length;null!=n&&r<e;)n=n[no(t[r++])];
    return r&&r==e?n:X}function de(n,t,r){var e=t(n);return bh(n)?e:a(e,r(n))}function we(n){return null==n?n===X?ut:Jn:Bl&&Bl in ll(n)?ki(n):Ki(n)}function me(n,t){return n>t}function xe(n,t){return null!=n&&bl.call(n,t)}function je(n,t){return null!=n&&t in ll(n)}function Ae(n,t,r){return n>=Hl(t,r)&&n<Gl(t,r)}function ke(n,t,r){for(var e=r?f:o,u=n[0].length,i=n.length,a=i,l=il(i),s=1/0,h=[];a--;){var p=n[a];a&&t&&(p=c(p,z(t))),s=Hl(p.length,s),l[a]=!r&&(t||u>=120&&p.length>=120)?new yr(a&&p):X}p=n[0];
    var _=-1,v=l[0];n:for(;++_<u&&h.length<s;){var g=p[_],y=t?t(g):g;if(g=r||0!==g?g:0,!(v?S(v,y):e(h,y,r))){for(a=i;--a;){var d=l[a];if(!(d?S(d,y):e(n[a],y,r)))continue n}v&&v.push(y),h.push(g)}}return h}function Oe(n,t,r,e){return ue(n,function(n,u,i){t(e,r(n),u,i)}),e}function Ie(t,r,e){r=ku(r,t),t=Gi(t,r);var u=null==t?t:t[no(jo(r))];return null==u?X:n(u,t,e)}function Re(n){return cc(n)&&we(n)==Dn}function ze(n){return cc(n)&&we(n)==ft}function Ee(n){return cc(n)&&we(n)==Pn}function Se(n,t,r,e,u){
    return n===t||(null==n||null==t||!cc(n)&&!cc(t)?n!==n&&t!==t:We(n,t,r,e,Se,u))}function We(n,t,r,e,u,i){var o=bh(n),f=bh(t),c=o?Mn:zs(n),a=f?Mn:zs(t);c=c==Dn?Yn:c,a=a==Dn?Yn:a;var l=c==Yn,s=a==Yn,h=c==a;if(h&&mh(n)){if(!mh(t))return!1;o=!0,l=!1}if(h&&!l)return i||(i=new wr),o||Oh(n)?pi(n,t,r,e,u,i):_i(n,t,c,r,e,u,i);if(!(r&hn)){var p=l&&bl.call(n,"__wrapped__"),_=s&&bl.call(t,"__wrapped__");if(p||_){var v=p?n.value():n,g=_?t.value():t;return i||(i=new wr),u(v,g,r,e,i)}}return!!h&&(i||(i=new wr),vi(n,t,r,e,u,i));
    }function Le(n){return cc(n)&&zs(n)==Gn}function Ce(n,t,r,e){var u=r.length,i=u,o=!e;if(null==n)return!i;for(n=ll(n);u--;){var f=r[u];if(o&&f[2]?f[1]!==n[f[0]]:!(f[0]in n))return!1}for(;++u<i;){f=r[u];var c=f[0],a=n[c],l=f[1];if(o&&f[2]){if(a===X&&!(c in n))return!1}else{var s=new wr;if(e)var h=e(a,l,c,n,t,s);if(!(h===X?Se(l,a,hn|pn,e,s):h))return!1}}return!0}function Ue(n){return!(!fc(n)||Di(n))&&(uc(n)?kl:Zt).test(to(n))}function Be(n){return cc(n)&&we(n)==nt}function Te(n){return cc(n)&&zs(n)==tt;
    }function $e(n){return cc(n)&&oc(n.length)&&!!Kr[we(n)]}function De(n){return"function"==typeof n?n:null==n?La:"object"==typeof n?bh(n)?Ze(n[0],n[1]):qe(n):Fa(n)}function Me(n){if(!Mi(n))return Vl(n);var t=[];for(var r in ll(n))bl.call(n,r)&&"constructor"!=r&&t.push(r);return t}function Fe(n){if(!fc(n))return Zi(n);var t=Mi(n),r=[];for(var e in n)("constructor"!=e||!t&&bl.call(n,e))&&r.push(e);return r}function Ne(n,t){return n<t}function Pe(n,t){var r=-1,e=Hf(n)?il(n.length):[];return ys(n,function(n,u,i){
    e[++r]=t(n,u,i)}),e}function qe(n){var t=ji(n);return 1==t.length&&t[0][2]?Ni(t[0][0],t[0][1]):function(r){return r===n||Ce(r,n,t)}}function Ze(n,t){return Bi(n)&&Fi(t)?Ni(no(n),t):function(r){var e=Mc(r,n);return e===X&&e===t?Nc(r,n):Se(t,e,hn|pn)}}function Ke(n,t,r,e,u){n!==t&&bs(t,function(i,o){if(u||(u=new wr),fc(i))Ve(n,t,o,r,Ke,e,u);else{var f=e?e(Ji(n,o),i,o+"",n,t,u):X;f===X&&(f=i),Er(n,o,f)}},qc)}function Ve(n,t,r,e,u,i,o){var f=Ji(n,r),c=Ji(t,r),a=o.get(c);if(a)return Er(n,r,a),X;var l=i?i(f,c,r+"",n,t,o):X,s=l===X;
    if(s){var h=bh(c),p=!h&&mh(c),_=!h&&!p&&Oh(c);l=c,h||p||_?bh(f)?l=f:Jf(f)?l=Tu(f):p?(s=!1,l=Iu(c,!0)):_?(s=!1,l=Wu(c,!0)):l=[]:gc(c)||dh(c)?(l=f,dh(f)?l=Rc(f):fc(f)&&!uc(f)||(l=Ei(c))):s=!1}s&&(o.set(c,l),u(l,c,e,i,o),o.delete(c)),Er(n,r,l)}function Ge(n,t){var r=n.length;if(r)return t+=t<0?r:0,Ci(t,r)?n[t]:X}function He(n,t,r){t=t.length?c(t,function(n){return bh(n)?function(t){return _e(t,1===n.length?n[0]:n)}:n}):[La];var e=-1;return t=c(t,z(mi())),A(Pe(n,function(n,r,u){return{criteria:c(t,function(t){
    return t(n)}),index:++e,value:n}}),function(n,t){return Cu(n,t,r)})}function Je(n,t){return Ye(n,t,function(t,r){return Nc(n,r)})}function Ye(n,t,r){for(var e=-1,u=t.length,i={};++e<u;){var o=t[e],f=_e(n,o);r(f,o)&&fu(i,ku(o,n),f)}return i}function Qe(n){return function(t){return _e(t,n)}}function Xe(n,t,r,e){var u=e?d:y,i=-1,o=t.length,f=n;for(n===t&&(t=Tu(t)),r&&(f=c(n,z(r)));++i<o;)for(var a=0,l=t[i],s=r?r(l):l;(a=u(f,s,a,e))>-1;)f!==n&&Ll.call(f,a,1),Ll.call(n,a,1);return n}function nu(n,t){for(var r=n?t.length:0,e=r-1;r--;){
    var u=t[r];if(r==e||u!==i){var i=u;Ci(u)?Ll.call(n,u,1):yu(n,u)}}return n}function tu(n,t){return n+Nl(Ql()*(t-n+1))}function ru(n,t,r,e){for(var u=-1,i=Gl(Fl((t-n)/(r||1)),0),o=il(i);i--;)o[e?i:++u]=n,n+=r;return o}function eu(n,t){var r="";if(!n||t<1||t>Wn)return r;do t%2&&(r+=n),t=Nl(t/2),t&&(n+=n);while(t);return r}function uu(n,t){return Ls(Vi(n,t,La),n+"")}function iu(n){return Ir(ra(n))}function ou(n,t){var r=ra(n);return Xi(r,Mr(t,0,r.length))}function fu(n,t,r,e){if(!fc(n))return n;t=ku(t,n);
    for(var u=-1,i=t.length,o=i-1,f=n;null!=f&&++u<i;){var c=no(t[u]),a=r;if("__proto__"===c||"constructor"===c||"prototype"===c)return n;if(u!=o){var l=f[c];a=e?e(l,c,f):X,a===X&&(a=fc(l)?l:Ci(t[u+1])?[]:{})}Sr(f,c,a),f=f[c]}return n}function cu(n){return Xi(ra(n))}function au(n,t,r){var e=-1,u=n.length;t<0&&(t=-t>u?0:u+t),r=r>u?u:r,r<0&&(r+=u),u=t>r?0:r-t>>>0,t>>>=0;for(var i=il(u);++e<u;)i[e]=n[e+t];return i}function lu(n,t){var r;return ys(n,function(n,e,u){return r=t(n,e,u),!r}),!!r}function su(n,t,r){
    var e=0,u=null==n?e:n.length;if("number"==typeof t&&t===t&&u<=Tn){for(;e<u;){var i=e+u>>>1,o=n[i];null!==o&&!bc(o)&&(r?o<=t:o<t)?e=i+1:u=i}return u}return hu(n,t,La,r)}function hu(n,t,r,e){var u=0,i=null==n?0:n.length;if(0===i)return 0;t=r(t);for(var o=t!==t,f=null===t,c=bc(t),a=t===X;u<i;){var l=Nl((u+i)/2),s=r(n[l]),h=s!==X,p=null===s,_=s===s,v=bc(s);if(o)var g=e||_;else g=a?_&&(e||h):f?_&&h&&(e||!p):c?_&&h&&!p&&(e||!v):!p&&!v&&(e?s<=t:s<t);g?u=l+1:i=l}return Hl(i,Bn)}function pu(n,t){for(var r=-1,e=n.length,u=0,i=[];++r<e;){
    var o=n[r],f=t?t(o):o;if(!r||!Gf(f,c)){var c=f;i[u++]=0===o?0:o}}return i}function _u(n){return"number"==typeof n?n:bc(n)?Cn:+n}function vu(n){if("string"==typeof n)return n;if(bh(n))return c(n,vu)+"";if(bc(n))return vs?vs.call(n):"";var t=n+"";return"0"==t&&1/n==-Sn?"-0":t}function gu(n,t,r){var e=-1,u=o,i=n.length,c=!0,a=[],l=a;if(r)c=!1,u=f;else if(i>=tn){var s=t?null:ks(n);if(s)return P(s);c=!1,u=S,l=new yr}else l=t?[]:a;n:for(;++e<i;){var h=n[e],p=t?t(h):h;if(h=r||0!==h?h:0,c&&p===p){for(var _=l.length;_--;)if(l[_]===p)continue n;
    t&&l.push(p),a.push(h)}else u(l,p,r)||(l!==a&&l.push(p),a.push(h))}return a}function yu(n,t){return t=ku(t,n),n=Gi(n,t),null==n||delete n[no(jo(t))]}function du(n,t,r,e){return fu(n,t,r(_e(n,t)),e)}function bu(n,t,r,e){for(var u=n.length,i=e?u:-1;(e?i--:++i<u)&&t(n[i],i,n););return r?au(n,e?0:i,e?i+1:u):au(n,e?i+1:0,e?u:i)}function wu(n,t){var r=n;return r instanceof Ct&&(r=r.value()),l(t,function(n,t){return t.func.apply(t.thisArg,a([n],t.args))},r)}function mu(n,t,r){var e=n.length;if(e<2)return e?gu(n[0]):[];
    for(var u=-1,i=il(e);++u<e;)for(var o=n[u],f=-1;++f<e;)f!=u&&(i[u]=Hr(i[u]||o,n[f],t,r));return gu(ee(i,1),t,r)}function xu(n,t,r){for(var e=-1,u=n.length,i=t.length,o={};++e<u;){r(o,n[e],e<i?t[e]:X)}return o}function ju(n){return Jf(n)?n:[]}function Au(n){return"function"==typeof n?n:La}function ku(n,t){return bh(n)?n:Bi(n,t)?[n]:Cs(Ec(n))}function Ou(n,t,r){var e=n.length;return r=r===X?e:r,!t&&r>=e?n:au(n,t,r)}function Iu(n,t){if(t)return n.slice();var r=n.length,e=zl?zl(r):new n.constructor(r);
    return n.copy(e),e}function Ru(n){var t=new n.constructor(n.byteLength);return new Rl(t).set(new Rl(n)),t}function zu(n,t){return new n.constructor(t?Ru(n.buffer):n.buffer,n.byteOffset,n.byteLength)}function Eu(n){var t=new n.constructor(n.source,Nt.exec(n));return t.lastIndex=n.lastIndex,t}function Su(n){return _s?ll(_s.call(n)):{}}function Wu(n,t){return new n.constructor(t?Ru(n.buffer):n.buffer,n.byteOffset,n.length)}function Lu(n,t){if(n!==t){var r=n!==X,e=null===n,u=n===n,i=bc(n),o=t!==X,f=null===t,c=t===t,a=bc(t);
    if(!f&&!a&&!i&&n>t||i&&o&&c&&!f&&!a||e&&o&&c||!r&&c||!u)return 1;if(!e&&!i&&!a&&n<t||a&&r&&u&&!e&&!i||f&&r&&u||!o&&u||!c)return-1}return 0}function Cu(n,t,r){for(var e=-1,u=n.criteria,i=t.criteria,o=u.length,f=r.length;++e<o;){var c=Lu(u[e],i[e]);if(c){if(e>=f)return c;return c*("desc"==r[e]?-1:1)}}return n.index-t.index}function Uu(n,t,r,e){for(var u=-1,i=n.length,o=r.length,f=-1,c=t.length,a=Gl(i-o,0),l=il(c+a),s=!e;++f<c;)l[f]=t[f];for(;++u<o;)(s||u<i)&&(l[r[u]]=n[u]);for(;a--;)l[f++]=n[u++];return l;
    }function Bu(n,t,r,e){for(var u=-1,i=n.length,o=-1,f=r.length,c=-1,a=t.length,l=Gl(i-f,0),s=il(l+a),h=!e;++u<l;)s[u]=n[u];for(var p=u;++c<a;)s[p+c]=t[c];for(;++o<f;)(h||u<i)&&(s[p+r[o]]=n[u++]);return s}function Tu(n,t){var r=-1,e=n.length;for(t||(t=il(e));++r<e;)t[r]=n[r];return t}function $u(n,t,r,e){var u=!r;r||(r={});for(var i=-1,o=t.length;++i<o;){var f=t[i],c=e?e(r[f],n[f],f,r,n):X;c===X&&(c=n[f]),u?Br(r,f,c):Sr(r,f,c)}return r}function Du(n,t){return $u(n,Is(n),t)}function Mu(n,t){return $u(n,Rs(n),t);
    }function Fu(n,r){return function(e,u){var i=bh(e)?t:Lr,o=r?r():{};return i(e,n,mi(u,2),o)}}function Nu(n){return uu(function(t,r){var e=-1,u=r.length,i=u>1?r[u-1]:X,o=u>2?r[2]:X;for(i=n.length>3&&"function"==typeof i?(u--,i):X,o&&Ui(r[0],r[1],o)&&(i=u<3?X:i,u=1),t=ll(t);++e<u;){var f=r[e];f&&n(t,f,e,i)}return t})}function Pu(n,t){return function(r,e){if(null==r)return r;if(!Hf(r))return n(r,e);for(var u=r.length,i=t?u:-1,o=ll(r);(t?i--:++i<u)&&e(o[i],i,o)!==!1;);return r}}function qu(n){return function(t,r,e){
    for(var u=-1,i=ll(t),o=e(t),f=o.length;f--;){var c=o[n?f:++u];if(r(i[c],c,i)===!1)break}return t}}function Zu(n,t,r){function e(){return(this&&this!==re&&this instanceof e?i:n).apply(u?r:this,arguments)}var u=t&_n,i=Gu(n);return e}function Ku(n){return function(t){t=Ec(t);var r=T(t)?G(t):X,e=r?r[0]:t.charAt(0),u=r?Ou(r,1).join(""):t.slice(1);return e[n]()+u}}function Vu(n){return function(t){return l(Ra(ca(t).replace($r,"")),n,"")}}function Gu(n){return function(){var t=arguments;switch(t.length){
    case 0:return new n;case 1:return new n(t[0]);case 2:return new n(t[0],t[1]);case 3:return new n(t[0],t[1],t[2]);case 4:return new n(t[0],t[1],t[2],t[3]);case 5:return new n(t[0],t[1],t[2],t[3],t[4]);case 6:return new n(t[0],t[1],t[2],t[3],t[4],t[5]);case 7:return new n(t[0],t[1],t[2],t[3],t[4],t[5],t[6])}var r=gs(n.prototype),e=n.apply(r,t);return fc(e)?e:r}}function Hu(t,r,e){function u(){for(var o=arguments.length,f=il(o),c=o,a=wi(u);c--;)f[c]=arguments[c];var l=o<3&&f[0]!==a&&f[o-1]!==a?[]:N(f,a);
    return o-=l.length,o<e?oi(t,r,Qu,u.placeholder,X,f,l,X,X,e-o):n(this&&this!==re&&this instanceof u?i:t,this,f)}var i=Gu(t);return u}function Ju(n){return function(t,r,e){var u=ll(t);if(!Hf(t)){var i=mi(r,3);t=Pc(t),r=function(n){return i(u[n],n,u)}}var o=n(t,r,e);return o>-1?u[i?t[o]:o]:X}}function Yu(n){return gi(function(t){var r=t.length,e=r,u=Y.prototype.thru;for(n&&t.reverse();e--;){var i=t[e];if("function"!=typeof i)throw new pl(en);if(u&&!o&&"wrapper"==bi(i))var o=new Y([],!0)}for(e=o?e:r;++e<r;){
    i=t[e];var f=bi(i),c="wrapper"==f?Os(i):X;o=c&&$i(c[0])&&c[1]==(mn|yn|bn|xn)&&!c[4].length&&1==c[9]?o[bi(c[0])].apply(o,c[3]):1==i.length&&$i(i)?o[f]():o.thru(i)}return function(){var n=arguments,e=n[0];if(o&&1==n.length&&bh(e))return o.plant(e).value();for(var u=0,i=r?t[u].apply(this,n):e;++u<r;)i=t[u].call(this,i);return i}})}function Qu(n,t,r,e,u,i,o,f,c,a){function l(){for(var y=arguments.length,d=il(y),b=y;b--;)d[b]=arguments[b];if(_)var w=wi(l),m=C(d,w);if(e&&(d=Uu(d,e,u,_)),i&&(d=Bu(d,i,o,_)),
    y-=m,_&&y<a){return oi(n,t,Qu,l.placeholder,r,d,N(d,w),f,c,a-y)}var x=h?r:this,j=p?x[n]:n;return y=d.length,f?d=Hi(d,f):v&&y>1&&d.reverse(),s&&c<y&&(d.length=c),this&&this!==re&&this instanceof l&&(j=g||Gu(j)),j.apply(x,d)}var s=t&mn,h=t&_n,p=t&vn,_=t&(yn|dn),v=t&jn,g=p?X:Gu(n);return l}function Xu(n,t){return function(r,e){return Oe(r,n,t(e),{})}}function ni(n,t){return function(r,e){var u;if(r===X&&e===X)return t;if(r!==X&&(u=r),e!==X){if(u===X)return e;"string"==typeof r||"string"==typeof e?(r=vu(r),
    e=vu(e)):(r=_u(r),e=_u(e)),u=n(r,e)}return u}}function ti(t){return gi(function(r){return r=c(r,z(mi())),uu(function(e){var u=this;return t(r,function(t){return n(t,u,e)})})})}function ri(n,t){t=t===X?" ":vu(t);var r=t.length;if(r<2)return r?eu(t,n):t;var e=eu(t,Fl(n/V(t)));return T(t)?Ou(G(e),0,n).join(""):e.slice(0,n)}function ei(t,r,e,u){function i(){for(var r=-1,c=arguments.length,a=-1,l=u.length,s=il(l+c),h=this&&this!==re&&this instanceof i?f:t;++a<l;)s[a]=u[a];for(;c--;)s[a++]=arguments[++r];
    return n(h,o?e:this,s)}var o=r&_n,f=Gu(t);return i}function ui(n){return function(t,r,e){return e&&"number"!=typeof e&&Ui(t,r,e)&&(r=e=X),t=Ac(t),r===X?(r=t,t=0):r=Ac(r),e=e===X?t<r?1:-1:Ac(e),ru(t,r,e,n)}}function ii(n){return function(t,r){return"string"==typeof t&&"string"==typeof r||(t=Ic(t),r=Ic(r)),n(t,r)}}function oi(n,t,r,e,u,i,o,f,c,a){var l=t&yn,s=l?o:X,h=l?X:o,p=l?i:X,_=l?X:i;t|=l?bn:wn,t&=~(l?wn:bn),t&gn||(t&=~(_n|vn));var v=[n,t,u,p,s,_,h,f,c,a],g=r.apply(X,v);return $i(n)&&Ss(g,v),g.placeholder=e,
    Yi(g,n,t)}function fi(n){var t=al[n];return function(n,r){if(n=Ic(n),r=null==r?0:Hl(kc(r),292),r&&Zl(n)){var e=(Ec(n)+"e").split("e");return e=(Ec(t(e[0]+"e"+(+e[1]+r)))+"e").split("e"),+(e[0]+"e"+(+e[1]-r))}return t(n)}}function ci(n){return function(t){var r=zs(t);return r==Gn?M(t):r==tt?q(t):I(t,n(t))}}function ai(n,t,r,e,u,i,o,f){var c=t&vn;if(!c&&"function"!=typeof n)throw new pl(en);var a=e?e.length:0;if(a||(t&=~(bn|wn),e=u=X),o=o===X?o:Gl(kc(o),0),f=f===X?f:kc(f),a-=u?u.length:0,t&wn){var l=e,s=u;
    e=u=X}var h=c?X:Os(n),p=[n,t,r,e,u,l,s,i,o,f];if(h&&qi(p,h),n=p[0],t=p[1],r=p[2],e=p[3],u=p[4],f=p[9]=p[9]===X?c?0:n.length:Gl(p[9]-a,0),!f&&t&(yn|dn)&&(t&=~(yn|dn)),t&&t!=_n)_=t==yn||t==dn?Hu(n,t,f):t!=bn&&t!=(_n|bn)||u.length?Qu.apply(X,p):ei(n,t,r,e);else var _=Zu(n,t,r);return Yi((h?ms:Ss)(_,p),n,t)}function li(n,t,r,e){return n===X||Gf(n,gl[r])&&!bl.call(e,r)?t:n}function si(n,t,r,e,u,i){return fc(n)&&fc(t)&&(i.set(t,n),Ke(n,t,X,si,i),i.delete(t)),n}function hi(n){return gc(n)?X:n}function pi(n,t,r,e,u,i){
    var o=r&hn,f=n.length,c=t.length;if(f!=c&&!(o&&c>f))return!1;var a=i.get(n),l=i.get(t);if(a&&l)return a==t&&l==n;var s=-1,p=!0,_=r&pn?new yr:X;for(i.set(n,t),i.set(t,n);++s<f;){var v=n[s],g=t[s];if(e)var y=o?e(g,v,s,t,n,i):e(v,g,s,n,t,i);if(y!==X){if(y)continue;p=!1;break}if(_){if(!h(t,function(n,t){if(!S(_,t)&&(v===n||u(v,n,r,e,i)))return _.push(t)})){p=!1;break}}else if(v!==g&&!u(v,g,r,e,i)){p=!1;break}}return i.delete(n),i.delete(t),p}function _i(n,t,r,e,u,i,o){switch(r){case ct:if(n.byteLength!=t.byteLength||n.byteOffset!=t.byteOffset)return!1;
    n=n.buffer,t=t.buffer;case ft:return!(n.byteLength!=t.byteLength||!i(new Rl(n),new Rl(t)));case Nn:case Pn:case Hn:return Gf(+n,+t);case Zn:return n.name==t.name&&n.message==t.message;case nt:case rt:return n==t+"";case Gn:var f=M;case tt:var c=e&hn;if(f||(f=P),n.size!=t.size&&!c)return!1;var a=o.get(n);if(a)return a==t;e|=pn,o.set(n,t);var l=pi(f(n),f(t),e,u,i,o);return o.delete(n),l;case et:if(_s)return _s.call(n)==_s.call(t)}return!1}function vi(n,t,r,e,u,i){var o=r&hn,f=yi(n),c=f.length;if(c!=yi(t).length&&!o)return!1;
    for(var a=c;a--;){var l=f[a];if(!(o?l in t:bl.call(t,l)))return!1}var s=i.get(n),h=i.get(t);if(s&&h)return s==t&&h==n;var p=!0;i.set(n,t),i.set(t,n);for(var _=o;++a<c;){l=f[a];var v=n[l],g=t[l];if(e)var y=o?e(g,v,l,t,n,i):e(v,g,l,n,t,i);if(!(y===X?v===g||u(v,g,r,e,i):y)){p=!1;break}_||(_="constructor"==l)}if(p&&!_){var d=n.constructor,b=t.constructor;d!=b&&"constructor"in n&&"constructor"in t&&!("function"==typeof d&&d instanceof d&&"function"==typeof b&&b instanceof b)&&(p=!1)}return i.delete(n),
    i.delete(t),p}function gi(n){return Ls(Vi(n,X,_o),n+"")}function yi(n){return de(n,Pc,Is)}function di(n){return de(n,qc,Rs)}function bi(n){for(var t=n.name+"",r=fs[t],e=bl.call(fs,t)?r.length:0;e--;){var u=r[e],i=u.func;if(null==i||i==n)return u.name}return t}function wi(n){return(bl.call(Z,"placeholder")?Z:n).placeholder}function mi(){var n=Z.iteratee||Ca;return n=n===Ca?De:n,arguments.length?n(arguments[0],arguments[1]):n}function xi(n,t){var r=n.__data__;return Ti(t)?r["string"==typeof t?"string":"hash"]:r.map;
    }function ji(n){for(var t=Pc(n),r=t.length;r--;){var e=t[r],u=n[e];t[r]=[e,u,Fi(u)]}return t}function Ai(n,t){var r=B(n,t);return Ue(r)?r:X}function ki(n){var t=bl.call(n,Bl),r=n[Bl];try{n[Bl]=X;var e=!0}catch(n){}var u=xl.call(n);return e&&(t?n[Bl]=r:delete n[Bl]),u}function Oi(n,t,r){for(var e=-1,u=r.length;++e<u;){var i=r[e],o=i.size;switch(i.type){case"drop":n+=o;break;case"dropRight":t-=o;break;case"take":t=Hl(t,n+o);break;case"takeRight":n=Gl(n,t-o)}}return{start:n,end:t}}function Ii(n){var t=n.match(Bt);
    return t?t[1].split(Tt):[]}function Ri(n,t,r){t=ku(t,n);for(var e=-1,u=t.length,i=!1;++e<u;){var o=no(t[e]);if(!(i=null!=n&&r(n,o)))break;n=n[o]}return i||++e!=u?i:(u=null==n?0:n.length,!!u&&oc(u)&&Ci(o,u)&&(bh(n)||dh(n)))}function zi(n){var t=n.length,r=new n.constructor(t);return t&&"string"==typeof n[0]&&bl.call(n,"index")&&(r.index=n.index,r.input=n.input),r}function Ei(n){return"function"!=typeof n.constructor||Mi(n)?{}:gs(El(n))}function Si(n,t,r){var e=n.constructor;switch(t){case ft:return Ru(n);
    case Nn:case Pn:return new e(+n);case ct:return zu(n,r);case at:case lt:case st:case ht:case pt:case _t:case vt:case gt:case yt:return Wu(n,r);case Gn:return new e;case Hn:case rt:return new e(n);case nt:return Eu(n);case tt:return new e;case et:return Su(n)}}function Wi(n,t){var r=t.length;if(!r)return n;var e=r-1;return t[e]=(r>1?"& ":"")+t[e],t=t.join(r>2?", ":" "),n.replace(Ut,"{\n/* [wrapped with "+t+"] */\n")}function Li(n){return bh(n)||dh(n)||!!(Cl&&n&&n[Cl])}function Ci(n,t){var r=typeof n;
    return t=null==t?Wn:t,!!t&&("number"==r||"symbol"!=r&&Vt.test(n))&&n>-1&&n%1==0&&n<t}function Ui(n,t,r){if(!fc(r))return!1;var e=typeof t;return!!("number"==e?Hf(r)&&Ci(t,r.length):"string"==e&&t in r)&&Gf(r[t],n)}function Bi(n,t){if(bh(n))return!1;var r=typeof n;return!("number"!=r&&"symbol"!=r&&"boolean"!=r&&null!=n&&!bc(n))||(zt.test(n)||!Rt.test(n)||null!=t&&n in ll(t))}function Ti(n){var t=typeof n;return"string"==t||"number"==t||"symbol"==t||"boolean"==t?"__proto__"!==n:null===n}function $i(n){
    var t=bi(n),r=Z[t];if("function"!=typeof r||!(t in Ct.prototype))return!1;if(n===r)return!0;var e=Os(r);return!!e&&n===e[0]}function Di(n){return!!ml&&ml in n}function Mi(n){var t=n&&n.constructor;return n===("function"==typeof t&&t.prototype||gl)}function Fi(n){return n===n&&!fc(n)}function Ni(n,t){return function(r){return null!=r&&(r[n]===t&&(t!==X||n in ll(r)))}}function Pi(n){var t=Cf(n,function(n){return r.size===fn&&r.clear(),n}),r=t.cache;return t}function qi(n,t){var r=n[1],e=t[1],u=r|e,i=u<(_n|vn|mn),o=e==mn&&r==yn||e==mn&&r==xn&&n[7].length<=t[8]||e==(mn|xn)&&t[7].length<=t[8]&&r==yn;
    if(!i&&!o)return n;e&_n&&(n[2]=t[2],u|=r&_n?0:gn);var f=t[3];if(f){var c=n[3];n[3]=c?Uu(c,f,t[4]):f,n[4]=c?N(n[3],cn):t[4]}return f=t[5],f&&(c=n[5],n[5]=c?Bu(c,f,t[6]):f,n[6]=c?N(n[5],cn):t[6]),f=t[7],f&&(n[7]=f),e&mn&&(n[8]=null==n[8]?t[8]:Hl(n[8],t[8])),null==n[9]&&(n[9]=t[9]),n[0]=t[0],n[1]=u,n}function Zi(n){var t=[];if(null!=n)for(var r in ll(n))t.push(r);return t}function Ki(n){return xl.call(n)}function Vi(t,r,e){return r=Gl(r===X?t.length-1:r,0),function(){for(var u=arguments,i=-1,o=Gl(u.length-r,0),f=il(o);++i<o;)f[i]=u[r+i];
    i=-1;for(var c=il(r+1);++i<r;)c[i]=u[i];return c[r]=e(f),n(t,this,c)}}function Gi(n,t){return t.length<2?n:_e(n,au(t,0,-1))}function Hi(n,t){for(var r=n.length,e=Hl(t.length,r),u=Tu(n);e--;){var i=t[e];n[e]=Ci(i,r)?u[i]:X}return n}function Ji(n,t){if(("constructor"!==t||"function"!=typeof n[t])&&"__proto__"!=t)return n[t]}function Yi(n,t,r){var e=t+"";return Ls(n,Wi(e,ro(Ii(e),r)))}function Qi(n){var t=0,r=0;return function(){var e=Jl(),u=In-(e-r);if(r=e,u>0){if(++t>=On)return arguments[0]}else t=0;
    return n.apply(X,arguments)}}function Xi(n,t){var r=-1,e=n.length,u=e-1;for(t=t===X?e:t;++r<t;){var i=tu(r,u),o=n[i];n[i]=n[r],n[r]=o}return n.length=t,n}function no(n){if("string"==typeof n||bc(n))return n;var t=n+"";return"0"==t&&1/n==-Sn?"-0":t}function to(n){if(null!=n){try{return dl.call(n)}catch(n){}try{return n+""}catch(n){}}return""}function ro(n,t){return r($n,function(r){var e="_."+r[0];t&r[1]&&!o(n,e)&&n.push(e)}),n.sort()}function eo(n){if(n instanceof Ct)return n.clone();var t=new Y(n.__wrapped__,n.__chain__);
    return t.__actions__=Tu(n.__actions__),t.__index__=n.__index__,t.__values__=n.__values__,t}function uo(n,t,r){t=(r?Ui(n,t,r):t===X)?1:Gl(kc(t),0);var e=null==n?0:n.length;if(!e||t<1)return[];for(var u=0,i=0,o=il(Fl(e/t));u<e;)o[i++]=au(n,u,u+=t);return o}function io(n){for(var t=-1,r=null==n?0:n.length,e=0,u=[];++t<r;){var i=n[t];i&&(u[e++]=i)}return u}function oo(){var n=arguments.length;if(!n)return[];for(var t=il(n-1),r=arguments[0],e=n;e--;)t[e-1]=arguments[e];return a(bh(r)?Tu(r):[r],ee(t,1));
    }function fo(n,t,r){var e=null==n?0:n.length;return e?(t=r||t===X?1:kc(t),au(n,t<0?0:t,e)):[]}function co(n,t,r){var e=null==n?0:n.length;return e?(t=r||t===X?1:kc(t),t=e-t,au(n,0,t<0?0:t)):[]}function ao(n,t){return n&&n.length?bu(n,mi(t,3),!0,!0):[]}function lo(n,t){return n&&n.length?bu(n,mi(t,3),!0):[]}function so(n,t,r,e){var u=null==n?0:n.length;return u?(r&&"number"!=typeof r&&Ui(n,t,r)&&(r=0,e=u),ne(n,t,r,e)):[]}function ho(n,t,r){var e=null==n?0:n.length;if(!e)return-1;var u=null==r?0:kc(r);
    return u<0&&(u=Gl(e+u,0)),g(n,mi(t,3),u)}function po(n,t,r){var e=null==n?0:n.length;if(!e)return-1;var u=e-1;return r!==X&&(u=kc(r),u=r<0?Gl(e+u,0):Hl(u,e-1)),g(n,mi(t,3),u,!0)}function _o(n){return(null==n?0:n.length)?ee(n,1):[]}function vo(n){return(null==n?0:n.length)?ee(n,Sn):[]}function go(n,t){return(null==n?0:n.length)?(t=t===X?1:kc(t),ee(n,t)):[]}function yo(n){for(var t=-1,r=null==n?0:n.length,e={};++t<r;){var u=n[t];e[u[0]]=u[1]}return e}function bo(n){return n&&n.length?n[0]:X}function wo(n,t,r){
    var e=null==n?0:n.length;if(!e)return-1;var u=null==r?0:kc(r);return u<0&&(u=Gl(e+u,0)),y(n,t,u)}function mo(n){return(null==n?0:n.length)?au(n,0,-1):[]}function xo(n,t){return null==n?"":Kl.call(n,t)}function jo(n){var t=null==n?0:n.length;return t?n[t-1]:X}function Ao(n,t,r){var e=null==n?0:n.length;if(!e)return-1;var u=e;return r!==X&&(u=kc(r),u=u<0?Gl(e+u,0):Hl(u,e-1)),t===t?K(n,t,u):g(n,b,u,!0)}function ko(n,t){return n&&n.length?Ge(n,kc(t)):X}function Oo(n,t){return n&&n.length&&t&&t.length?Xe(n,t):n;
    }function Io(n,t,r){return n&&n.length&&t&&t.length?Xe(n,t,mi(r,2)):n}function Ro(n,t,r){return n&&n.length&&t&&t.length?Xe(n,t,X,r):n}function zo(n,t){var r=[];if(!n||!n.length)return r;var e=-1,u=[],i=n.length;for(t=mi(t,3);++e<i;){var o=n[e];t(o,e,n)&&(r.push(o),u.push(e))}return nu(n,u),r}function Eo(n){return null==n?n:Xl.call(n)}function So(n,t,r){var e=null==n?0:n.length;return e?(r&&"number"!=typeof r&&Ui(n,t,r)?(t=0,r=e):(t=null==t?0:kc(t),r=r===X?e:kc(r)),au(n,t,r)):[]}function Wo(n,t){
    return su(n,t)}function Lo(n,t,r){return hu(n,t,mi(r,2))}function Co(n,t){var r=null==n?0:n.length;if(r){var e=su(n,t);if(e<r&&Gf(n[e],t))return e}return-1}function Uo(n,t){return su(n,t,!0)}function Bo(n,t,r){return hu(n,t,mi(r,2),!0)}function To(n,t){if(null==n?0:n.length){var r=su(n,t,!0)-1;if(Gf(n[r],t))return r}return-1}function $o(n){return n&&n.length?pu(n):[]}function Do(n,t){return n&&n.length?pu(n,mi(t,2)):[]}function Mo(n){var t=null==n?0:n.length;return t?au(n,1,t):[]}function Fo(n,t,r){
    return n&&n.length?(t=r||t===X?1:kc(t),au(n,0,t<0?0:t)):[]}function No(n,t,r){var e=null==n?0:n.length;return e?(t=r||t===X?1:kc(t),t=e-t,au(n,t<0?0:t,e)):[]}function Po(n,t){return n&&n.length?bu(n,mi(t,3),!1,!0):[]}function qo(n,t){return n&&n.length?bu(n,mi(t,3)):[]}function Zo(n){return n&&n.length?gu(n):[]}function Ko(n,t){return n&&n.length?gu(n,mi(t,2)):[]}function Vo(n,t){return t="function"==typeof t?t:X,n&&n.length?gu(n,X,t):[]}function Go(n){if(!n||!n.length)return[];var t=0;return n=i(n,function(n){
    if(Jf(n))return t=Gl(n.length,t),!0}),O(t,function(t){return c(n,m(t))})}function Ho(t,r){if(!t||!t.length)return[];var e=Go(t);return null==r?e:c(e,function(t){return n(r,X,t)})}function Jo(n,t){return xu(n||[],t||[],Sr)}function Yo(n,t){return xu(n||[],t||[],fu)}function Qo(n){var t=Z(n);return t.__chain__=!0,t}function Xo(n,t){return t(n),n}function nf(n,t){return t(n)}function tf(){return Qo(this)}function rf(){return new Y(this.value(),this.__chain__)}function ef(){this.__values__===X&&(this.__values__=jc(this.value()));
    var n=this.__index__>=this.__values__.length;return{done:n,value:n?X:this.__values__[this.__index__++]}}function uf(){return this}function of(n){for(var t,r=this;r instanceof J;){var e=eo(r);e.__index__=0,e.__values__=X,t?u.__wrapped__=e:t=e;var u=e;r=r.__wrapped__}return u.__wrapped__=n,t}function ff(){var n=this.__wrapped__;if(n instanceof Ct){var t=n;return this.__actions__.length&&(t=new Ct(this)),t=t.reverse(),t.__actions__.push({func:nf,args:[Eo],thisArg:X}),new Y(t,this.__chain__)}return this.thru(Eo);
    }function cf(){return wu(this.__wrapped__,this.__actions__)}function af(n,t,r){var e=bh(n)?u:Jr;return r&&Ui(n,t,r)&&(t=X),e(n,mi(t,3))}function lf(n,t){return(bh(n)?i:te)(n,mi(t,3))}function sf(n,t){return ee(yf(n,t),1)}function hf(n,t){return ee(yf(n,t),Sn)}function pf(n,t,r){return r=r===X?1:kc(r),ee(yf(n,t),r)}function _f(n,t){return(bh(n)?r:ys)(n,mi(t,3))}function vf(n,t){return(bh(n)?e:ds)(n,mi(t,3))}function gf(n,t,r,e){n=Hf(n)?n:ra(n),r=r&&!e?kc(r):0;var u=n.length;return r<0&&(r=Gl(u+r,0)),
    dc(n)?r<=u&&n.indexOf(t,r)>-1:!!u&&y(n,t,r)>-1}function yf(n,t){return(bh(n)?c:Pe)(n,mi(t,3))}function df(n,t,r,e){return null==n?[]:(bh(t)||(t=null==t?[]:[t]),r=e?X:r,bh(r)||(r=null==r?[]:[r]),He(n,t,r))}function bf(n,t,r){var e=bh(n)?l:j,u=arguments.length<3;return e(n,mi(t,4),r,u,ys)}function wf(n,t,r){var e=bh(n)?s:j,u=arguments.length<3;return e(n,mi(t,4),r,u,ds)}function mf(n,t){return(bh(n)?i:te)(n,Uf(mi(t,3)))}function xf(n){return(bh(n)?Ir:iu)(n)}function jf(n,t,r){return t=(r?Ui(n,t,r):t===X)?1:kc(t),
    (bh(n)?Rr:ou)(n,t)}function Af(n){return(bh(n)?zr:cu)(n)}function kf(n){if(null==n)return 0;if(Hf(n))return dc(n)?V(n):n.length;var t=zs(n);return t==Gn||t==tt?n.size:Me(n).length}function Of(n,t,r){var e=bh(n)?h:lu;return r&&Ui(n,t,r)&&(t=X),e(n,mi(t,3))}function If(n,t){if("function"!=typeof t)throw new pl(en);return n=kc(n),function(){if(--n<1)return t.apply(this,arguments)}}function Rf(n,t,r){return t=r?X:t,t=n&&null==t?n.length:t,ai(n,mn,X,X,X,X,t)}function zf(n,t){var r;if("function"!=typeof t)throw new pl(en);
    return n=kc(n),function(){return--n>0&&(r=t.apply(this,arguments)),n<=1&&(t=X),r}}function Ef(n,t,r){t=r?X:t;var e=ai(n,yn,X,X,X,X,X,t);return e.placeholder=Ef.placeholder,e}function Sf(n,t,r){t=r?X:t;var e=ai(n,dn,X,X,X,X,X,t);return e.placeholder=Sf.placeholder,e}function Wf(n,t,r){function e(t){var r=h,e=p;return h=p=X,d=t,v=n.apply(e,r)}function u(n){return d=n,g=Ws(f,t),b?e(n):v}function i(n){var r=n-y,e=n-d,u=t-r;return w?Hl(u,_-e):u}function o(n){var r=n-y,e=n-d;return y===X||r>=t||r<0||w&&e>=_;
    }function f(){var n=fh();return o(n)?c(n):(g=Ws(f,i(n)),X)}function c(n){return g=X,m&&h?e(n):(h=p=X,v)}function a(){g!==X&&As(g),d=0,h=y=p=g=X}function l(){return g===X?v:c(fh())}function s(){var n=fh(),r=o(n);if(h=arguments,p=this,y=n,r){if(g===X)return u(y);if(w)return As(g),g=Ws(f,t),e(y)}return g===X&&(g=Ws(f,t)),v}var h,p,_,v,g,y,d=0,b=!1,w=!1,m=!0;if("function"!=typeof n)throw new pl(en);return t=Ic(t)||0,fc(r)&&(b=!!r.leading,w="maxWait"in r,_=w?Gl(Ic(r.maxWait)||0,t):_,m="trailing"in r?!!r.trailing:m),
    s.cancel=a,s.flush=l,s}function Lf(n){return ai(n,jn)}function Cf(n,t){if("function"!=typeof n||null!=t&&"function"!=typeof t)throw new pl(en);var r=function(){var e=arguments,u=t?t.apply(this,e):e[0],i=r.cache;if(i.has(u))return i.get(u);var o=n.apply(this,e);return r.cache=i.set(u,o)||i,o};return r.cache=new(Cf.Cache||sr),r}function Uf(n){if("function"!=typeof n)throw new pl(en);return function(){var t=arguments;switch(t.length){case 0:return!n.call(this);case 1:return!n.call(this,t[0]);case 2:
    return!n.call(this,t[0],t[1]);case 3:return!n.call(this,t[0],t[1],t[2])}return!n.apply(this,t)}}function Bf(n){return zf(2,n)}function Tf(n,t){if("function"!=typeof n)throw new pl(en);return t=t===X?t:kc(t),uu(n,t)}function $f(t,r){if("function"!=typeof t)throw new pl(en);return r=null==r?0:Gl(kc(r),0),uu(function(e){var u=e[r],i=Ou(e,0,r);return u&&a(i,u),n(t,this,i)})}function Df(n,t,r){var e=!0,u=!0;if("function"!=typeof n)throw new pl(en);return fc(r)&&(e="leading"in r?!!r.leading:e,u="trailing"in r?!!r.trailing:u),
    Wf(n,t,{leading:e,maxWait:t,trailing:u})}function Mf(n){return Rf(n,1)}function Ff(n,t){return ph(Au(t),n)}function Nf(){if(!arguments.length)return[];var n=arguments[0];return bh(n)?n:[n]}function Pf(n){return Fr(n,sn)}function qf(n,t){return t="function"==typeof t?t:X,Fr(n,sn,t)}function Zf(n){return Fr(n,an|sn)}function Kf(n,t){return t="function"==typeof t?t:X,Fr(n,an|sn,t)}function Vf(n,t){return null==t||Pr(n,t,Pc(t))}function Gf(n,t){return n===t||n!==n&&t!==t}function Hf(n){return null!=n&&oc(n.length)&&!uc(n);
    }function Jf(n){return cc(n)&&Hf(n)}function Yf(n){return n===!0||n===!1||cc(n)&&we(n)==Nn}function Qf(n){return cc(n)&&1===n.nodeType&&!gc(n)}function Xf(n){if(null==n)return!0;if(Hf(n)&&(bh(n)||"string"==typeof n||"function"==typeof n.splice||mh(n)||Oh(n)||dh(n)))return!n.length;var t=zs(n);if(t==Gn||t==tt)return!n.size;if(Mi(n))return!Me(n).length;for(var r in n)if(bl.call(n,r))return!1;return!0}function nc(n,t){return Se(n,t)}function tc(n,t,r){r="function"==typeof r?r:X;var e=r?r(n,t):X;return e===X?Se(n,t,X,r):!!e;
    }function rc(n){if(!cc(n))return!1;var t=we(n);return t==Zn||t==qn||"string"==typeof n.message&&"string"==typeof n.name&&!gc(n)}function ec(n){return"number"==typeof n&&Zl(n)}function uc(n){if(!fc(n))return!1;var t=we(n);return t==Kn||t==Vn||t==Fn||t==Xn}function ic(n){return"number"==typeof n&&n==kc(n)}function oc(n){return"number"==typeof n&&n>-1&&n%1==0&&n<=Wn}function fc(n){var t=typeof n;return null!=n&&("object"==t||"function"==t)}function cc(n){return null!=n&&"object"==typeof n}function ac(n,t){
    return n===t||Ce(n,t,ji(t))}function lc(n,t,r){return r="function"==typeof r?r:X,Ce(n,t,ji(t),r)}function sc(n){return vc(n)&&n!=+n}function hc(n){if(Es(n))throw new fl(rn);return Ue(n)}function pc(n){return null===n}function _c(n){return null==n}function vc(n){return"number"==typeof n||cc(n)&&we(n)==Hn}function gc(n){if(!cc(n)||we(n)!=Yn)return!1;var t=El(n);if(null===t)return!0;var r=bl.call(t,"constructor")&&t.constructor;return"function"==typeof r&&r instanceof r&&dl.call(r)==jl}function yc(n){
    return ic(n)&&n>=-Wn&&n<=Wn}function dc(n){return"string"==typeof n||!bh(n)&&cc(n)&&we(n)==rt}function bc(n){return"symbol"==typeof n||cc(n)&&we(n)==et}function wc(n){return n===X}function mc(n){return cc(n)&&zs(n)==it}function xc(n){return cc(n)&&we(n)==ot}function jc(n){if(!n)return[];if(Hf(n))return dc(n)?G(n):Tu(n);if(Ul&&n[Ul])return D(n[Ul]());var t=zs(n);return(t==Gn?M:t==tt?P:ra)(n)}function Ac(n){if(!n)return 0===n?n:0;if(n=Ic(n),n===Sn||n===-Sn){return(n<0?-1:1)*Ln}return n===n?n:0}function kc(n){
    var t=Ac(n),r=t%1;return t===t?r?t-r:t:0}function Oc(n){return n?Mr(kc(n),0,Un):0}function Ic(n){if("number"==typeof n)return n;if(bc(n))return Cn;if(fc(n)){var t="function"==typeof n.valueOf?n.valueOf():n;n=fc(t)?t+"":t}if("string"!=typeof n)return 0===n?n:+n;n=R(n);var r=qt.test(n);return r||Kt.test(n)?Xr(n.slice(2),r?2:8):Pt.test(n)?Cn:+n}function Rc(n){return $u(n,qc(n))}function zc(n){return n?Mr(kc(n),-Wn,Wn):0===n?n:0}function Ec(n){return null==n?"":vu(n)}function Sc(n,t){var r=gs(n);return null==t?r:Cr(r,t);
    }function Wc(n,t){return v(n,mi(t,3),ue)}function Lc(n,t){return v(n,mi(t,3),oe)}function Cc(n,t){return null==n?n:bs(n,mi(t,3),qc)}function Uc(n,t){return null==n?n:ws(n,mi(t,3),qc)}function Bc(n,t){return n&&ue(n,mi(t,3))}function Tc(n,t){return n&&oe(n,mi(t,3))}function $c(n){return null==n?[]:fe(n,Pc(n))}function Dc(n){return null==n?[]:fe(n,qc(n))}function Mc(n,t,r){var e=null==n?X:_e(n,t);return e===X?r:e}function Fc(n,t){return null!=n&&Ri(n,t,xe)}function Nc(n,t){return null!=n&&Ri(n,t,je);
    }function Pc(n){return Hf(n)?Or(n):Me(n)}function qc(n){return Hf(n)?Or(n,!0):Fe(n)}function Zc(n,t){var r={};return t=mi(t,3),ue(n,function(n,e,u){Br(r,t(n,e,u),n)}),r}function Kc(n,t){var r={};return t=mi(t,3),ue(n,function(n,e,u){Br(r,e,t(n,e,u))}),r}function Vc(n,t){return Gc(n,Uf(mi(t)))}function Gc(n,t){if(null==n)return{};var r=c(di(n),function(n){return[n]});return t=mi(t),Ye(n,r,function(n,r){return t(n,r[0])})}function Hc(n,t,r){t=ku(t,n);var e=-1,u=t.length;for(u||(u=1,n=X);++e<u;){var i=null==n?X:n[no(t[e])];
    i===X&&(e=u,i=r),n=uc(i)?i.call(n):i}return n}function Jc(n,t,r){return null==n?n:fu(n,t,r)}function Yc(n,t,r,e){return e="function"==typeof e?e:X,null==n?n:fu(n,t,r,e)}function Qc(n,t,e){var u=bh(n),i=u||mh(n)||Oh(n);if(t=mi(t,4),null==e){var o=n&&n.constructor;e=i?u?new o:[]:fc(n)&&uc(o)?gs(El(n)):{}}return(i?r:ue)(n,function(n,r,u){return t(e,n,r,u)}),e}function Xc(n,t){return null==n||yu(n,t)}function na(n,t,r){return null==n?n:du(n,t,Au(r))}function ta(n,t,r,e){return e="function"==typeof e?e:X,
    null==n?n:du(n,t,Au(r),e)}function ra(n){return null==n?[]:E(n,Pc(n))}function ea(n){return null==n?[]:E(n,qc(n))}function ua(n,t,r){return r===X&&(r=t,t=X),r!==X&&(r=Ic(r),r=r===r?r:0),t!==X&&(t=Ic(t),t=t===t?t:0),Mr(Ic(n),t,r)}function ia(n,t,r){return t=Ac(t),r===X?(r=t,t=0):r=Ac(r),n=Ic(n),Ae(n,t,r)}function oa(n,t,r){if(r&&"boolean"!=typeof r&&Ui(n,t,r)&&(t=r=X),r===X&&("boolean"==typeof t?(r=t,t=X):"boolean"==typeof n&&(r=n,n=X)),n===X&&t===X?(n=0,t=1):(n=Ac(n),t===X?(t=n,n=0):t=Ac(t)),n>t){
    var e=n;n=t,t=e}if(r||n%1||t%1){var u=Ql();return Hl(n+u*(t-n+Qr("1e-"+((u+"").length-1))),t)}return tu(n,t)}function fa(n){return Qh(Ec(n).toLowerCase())}function ca(n){return n=Ec(n),n&&n.replace(Gt,ve).replace(Dr,"")}function aa(n,t,r){n=Ec(n),t=vu(t);var e=n.length;r=r===X?e:Mr(kc(r),0,e);var u=r;return r-=t.length,r>=0&&n.slice(r,u)==t}function la(n){return n=Ec(n),n&&At.test(n)?n.replace(xt,ge):n}function sa(n){return n=Ec(n),n&&Wt.test(n)?n.replace(St,"\\$&"):n}function ha(n,t,r){n=Ec(n),t=kc(t);
    var e=t?V(n):0;if(!t||e>=t)return n;var u=(t-e)/2;return ri(Nl(u),r)+n+ri(Fl(u),r)}function pa(n,t,r){n=Ec(n),t=kc(t);var e=t?V(n):0;return t&&e<t?n+ri(t-e,r):n}function _a(n,t,r){n=Ec(n),t=kc(t);var e=t?V(n):0;return t&&e<t?ri(t-e,r)+n:n}function va(n,t,r){return r||null==t?t=0:t&&(t=+t),Yl(Ec(n).replace(Lt,""),t||0)}function ga(n,t,r){return t=(r?Ui(n,t,r):t===X)?1:kc(t),eu(Ec(n),t)}function ya(){var n=arguments,t=Ec(n[0]);return n.length<3?t:t.replace(n[1],n[2])}function da(n,t,r){return r&&"number"!=typeof r&&Ui(n,t,r)&&(t=r=X),
    (r=r===X?Un:r>>>0)?(n=Ec(n),n&&("string"==typeof t||null!=t&&!Ah(t))&&(t=vu(t),!t&&T(n))?Ou(G(n),0,r):n.split(t,r)):[]}function ba(n,t,r){return n=Ec(n),r=null==r?0:Mr(kc(r),0,n.length),t=vu(t),n.slice(r,r+t.length)==t}function wa(n,t,r){var e=Z.templateSettings;r&&Ui(n,t,r)&&(t=X),n=Ec(n),t=Sh({},t,e,li);var u,i,o=Sh({},t.imports,e.imports,li),f=Pc(o),c=E(o,f),a=0,l=t.interpolate||Ht,s="__p += '",h=sl((t.escape||Ht).source+"|"+l.source+"|"+(l===It?Ft:Ht).source+"|"+(t.evaluate||Ht).source+"|$","g"),p="//# sourceURL="+(bl.call(t,"sourceURL")?(t.sourceURL+"").replace(/\s/g," "):"lodash.templateSources["+ ++Zr+"]")+"\n";
    n.replace(h,function(t,r,e,o,f,c){return e||(e=o),s+=n.slice(a,c).replace(Jt,U),r&&(u=!0,s+="' +\n__e("+r+") +\n'"),f&&(i=!0,s+="';\n"+f+";\n__p += '"),e&&(s+="' +\n((__t = ("+e+")) == null ? '' : __t) +\n'"),a=c+t.length,t}),s+="';\n";var _=bl.call(t,"variable")&&t.variable;if(_){if(Dt.test(_))throw new fl(un)}else s="with (obj) {\n"+s+"\n}\n";s=(i?s.replace(dt,""):s).replace(bt,"$1").replace(wt,"$1;"),s="function("+(_||"obj")+") {\n"+(_?"":"obj || (obj = {});\n")+"var __t, __p = ''"+(u?", __e = _.escape":"")+(i?", __j = Array.prototype.join;\nfunction print() { __p += __j.call(arguments, '') }\n":";\n")+s+"return __p\n}";
    var v=Xh(function(){return cl(f,p+"return "+s).apply(X,c)});if(v.source=s,rc(v))throw v;return v}function ma(n){return Ec(n).toLowerCase()}function xa(n){return Ec(n).toUpperCase()}function ja(n,t,r){if(n=Ec(n),n&&(r||t===X))return R(n);if(!n||!(t=vu(t)))return n;var e=G(n),u=G(t);return Ou(e,W(e,u),L(e,u)+1).join("")}function Aa(n,t,r){if(n=Ec(n),n&&(r||t===X))return n.slice(0,H(n)+1);if(!n||!(t=vu(t)))return n;var e=G(n);return Ou(e,0,L(e,G(t))+1).join("")}function ka(n,t,r){if(n=Ec(n),n&&(r||t===X))return n.replace(Lt,"");
    if(!n||!(t=vu(t)))return n;var e=G(n);return Ou(e,W(e,G(t))).join("")}function Oa(n,t){var r=An,e=kn;if(fc(t)){var u="separator"in t?t.separator:u;r="length"in t?kc(t.length):r,e="omission"in t?vu(t.omission):e}n=Ec(n);var i=n.length;if(T(n)){var o=G(n);i=o.length}if(r>=i)return n;var f=r-V(e);if(f<1)return e;var c=o?Ou(o,0,f).join(""):n.slice(0,f);if(u===X)return c+e;if(o&&(f+=c.length-f),Ah(u)){if(n.slice(f).search(u)){var a,l=c;for(u.global||(u=sl(u.source,Ec(Nt.exec(u))+"g")),u.lastIndex=0;a=u.exec(l);)var s=a.index;
    c=c.slice(0,s===X?f:s)}}else if(n.indexOf(vu(u),f)!=f){var h=c.lastIndexOf(u);h>-1&&(c=c.slice(0,h))}return c+e}function Ia(n){return n=Ec(n),n&&jt.test(n)?n.replace(mt,ye):n}function Ra(n,t,r){return n=Ec(n),t=r?X:t,t===X?$(n)?Q(n):_(n):n.match(t)||[]}function za(t){var r=null==t?0:t.length,e=mi();return t=r?c(t,function(n){if("function"!=typeof n[1])throw new pl(en);return[e(n[0]),n[1]]}):[],uu(function(e){for(var u=-1;++u<r;){var i=t[u];if(n(i[0],this,e))return n(i[1],this,e)}})}function Ea(n){
    return Nr(Fr(n,an))}function Sa(n){return function(){return n}}function Wa(n,t){return null==n||n!==n?t:n}function La(n){return n}function Ca(n){return De("function"==typeof n?n:Fr(n,an))}function Ua(n){return qe(Fr(n,an))}function Ba(n,t){return Ze(n,Fr(t,an))}function Ta(n,t,e){var u=Pc(t),i=fe(t,u);null!=e||fc(t)&&(i.length||!u.length)||(e=t,t=n,n=this,i=fe(t,Pc(t)));var o=!(fc(e)&&"chain"in e&&!e.chain),f=uc(n);return r(i,function(r){var e=t[r];n[r]=e,f&&(n.prototype[r]=function(){var t=this.__chain__;
    if(o||t){var r=n(this.__wrapped__);return(r.__actions__=Tu(this.__actions__)).push({func:e,args:arguments,thisArg:n}),r.__chain__=t,r}return e.apply(n,a([this.value()],arguments))})}),n}function $a(){return re._===this&&(re._=Al),this}function Da(){}function Ma(n){return n=kc(n),uu(function(t){return Ge(t,n)})}function Fa(n){return Bi(n)?m(no(n)):Qe(n)}function Na(n){return function(t){return null==n?X:_e(n,t)}}function Pa(){return[]}function qa(){return!1}function Za(){return{}}function Ka(){return"";
    }function Va(){return!0}function Ga(n,t){if(n=kc(n),n<1||n>Wn)return[];var r=Un,e=Hl(n,Un);t=mi(t),n-=Un;for(var u=O(e,t);++r<n;)t(r);return u}function Ha(n){return bh(n)?c(n,no):bc(n)?[n]:Tu(Cs(Ec(n)))}function Ja(n){var t=++wl;return Ec(n)+t}function Ya(n){return n&&n.length?Yr(n,La,me):X}function Qa(n,t){return n&&n.length?Yr(n,mi(t,2),me):X}function Xa(n){return w(n,La)}function nl(n,t){return w(n,mi(t,2))}function tl(n){return n&&n.length?Yr(n,La,Ne):X}function rl(n,t){return n&&n.length?Yr(n,mi(t,2),Ne):X;
    }function el(n){return n&&n.length?k(n,La):0}function ul(n,t){return n&&n.length?k(n,mi(t,2)):0}x=null==x?re:be.defaults(re.Object(),x,be.pick(re,qr));var il=x.Array,ol=x.Date,fl=x.Error,cl=x.Function,al=x.Math,ll=x.Object,sl=x.RegExp,hl=x.String,pl=x.TypeError,_l=il.prototype,vl=cl.prototype,gl=ll.prototype,yl=x["__core-js_shared__"],dl=vl.toString,bl=gl.hasOwnProperty,wl=0,ml=function(){var n=/[^.]+$/.exec(yl&&yl.keys&&yl.keys.IE_PROTO||"");return n?"Symbol(src)_1."+n:""}(),xl=gl.toString,jl=dl.call(ll),Al=re._,kl=sl("^"+dl.call(bl).replace(St,"\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$"),Ol=ie?x.Buffer:X,Il=x.Symbol,Rl=x.Uint8Array,zl=Ol?Ol.allocUnsafe:X,El=F(ll.getPrototypeOf,ll),Sl=ll.create,Wl=gl.propertyIsEnumerable,Ll=_l.splice,Cl=Il?Il.isConcatSpreadable:X,Ul=Il?Il.iterator:X,Bl=Il?Il.toStringTag:X,Tl=function(){
    try{var n=Ai(ll,"defineProperty");return n({},"",{}),n}catch(n){}}(),$l=x.clearTimeout!==re.clearTimeout&&x.clearTimeout,Dl=ol&&ol.now!==re.Date.now&&ol.now,Ml=x.setTimeout!==re.setTimeout&&x.setTimeout,Fl=al.ceil,Nl=al.floor,Pl=ll.getOwnPropertySymbols,ql=Ol?Ol.isBuffer:X,Zl=x.isFinite,Kl=_l.join,Vl=F(ll.keys,ll),Gl=al.max,Hl=al.min,Jl=ol.now,Yl=x.parseInt,Ql=al.random,Xl=_l.reverse,ns=Ai(x,"DataView"),ts=Ai(x,"Map"),rs=Ai(x,"Promise"),es=Ai(x,"Set"),us=Ai(x,"WeakMap"),is=Ai(ll,"create"),os=us&&new us,fs={},cs=to(ns),as=to(ts),ls=to(rs),ss=to(es),hs=to(us),ps=Il?Il.prototype:X,_s=ps?ps.valueOf:X,vs=ps?ps.toString:X,gs=function(){
    function n(){}return function(t){if(!fc(t))return{};if(Sl)return Sl(t);n.prototype=t;var r=new n;return n.prototype=X,r}}();Z.templateSettings={escape:kt,evaluate:Ot,interpolate:It,variable:"",imports:{_:Z}},Z.prototype=J.prototype,Z.prototype.constructor=Z,Y.prototype=gs(J.prototype),Y.prototype.constructor=Y,Ct.prototype=gs(J.prototype),Ct.prototype.constructor=Ct,Xt.prototype.clear=nr,Xt.prototype.delete=tr,Xt.prototype.get=rr,Xt.prototype.has=er,Xt.prototype.set=ur,ir.prototype.clear=or,ir.prototype.delete=fr,
    ir.prototype.get=cr,ir.prototype.has=ar,ir.prototype.set=lr,sr.prototype.clear=hr,sr.prototype.delete=pr,sr.prototype.get=_r,sr.prototype.has=vr,sr.prototype.set=gr,yr.prototype.add=yr.prototype.push=dr,yr.prototype.has=br,wr.prototype.clear=mr,wr.prototype.delete=xr,wr.prototype.get=jr,wr.prototype.has=Ar,wr.prototype.set=kr;var ys=Pu(ue),ds=Pu(oe,!0),bs=qu(),ws=qu(!0),ms=os?function(n,t){return os.set(n,t),n}:La,xs=Tl?function(n,t){return Tl(n,"toString",{configurable:!0,enumerable:!1,value:Sa(t),
    writable:!0})}:La,js=uu,As=$l||function(n){return re.clearTimeout(n)},ks=es&&1/P(new es([,-0]))[1]==Sn?function(n){return new es(n)}:Da,Os=os?function(n){return os.get(n)}:Da,Is=Pl?function(n){return null==n?[]:(n=ll(n),i(Pl(n),function(t){return Wl.call(n,t)}))}:Pa,Rs=Pl?function(n){for(var t=[];n;)a(t,Is(n)),n=El(n);return t}:Pa,zs=we;(ns&&zs(new ns(new ArrayBuffer(1)))!=ct||ts&&zs(new ts)!=Gn||rs&&zs(rs.resolve())!=Qn||es&&zs(new es)!=tt||us&&zs(new us)!=it)&&(zs=function(n){var t=we(n),r=t==Yn?n.constructor:X,e=r?to(r):"";
    if(e)switch(e){case cs:return ct;case as:return Gn;case ls:return Qn;case ss:return tt;case hs:return it}return t});var Es=yl?uc:qa,Ss=Qi(ms),Ws=Ml||function(n,t){return re.setTimeout(n,t)},Ls=Qi(xs),Cs=Pi(function(n){var t=[];return 46===n.charCodeAt(0)&&t.push(""),n.replace(Et,function(n,r,e,u){t.push(e?u.replace(Mt,"$1"):r||n)}),t}),Us=uu(function(n,t){return Jf(n)?Hr(n,ee(t,1,Jf,!0)):[]}),Bs=uu(function(n,t){var r=jo(t);return Jf(r)&&(r=X),Jf(n)?Hr(n,ee(t,1,Jf,!0),mi(r,2)):[]}),Ts=uu(function(n,t){
    var r=jo(t);return Jf(r)&&(r=X),Jf(n)?Hr(n,ee(t,1,Jf,!0),X,r):[]}),$s=uu(function(n){var t=c(n,ju);return t.length&&t[0]===n[0]?ke(t):[]}),Ds=uu(function(n){var t=jo(n),r=c(n,ju);return t===jo(r)?t=X:r.pop(),r.length&&r[0]===n[0]?ke(r,mi(t,2)):[]}),Ms=uu(function(n){var t=jo(n),r=c(n,ju);return t="function"==typeof t?t:X,t&&r.pop(),r.length&&r[0]===n[0]?ke(r,X,t):[]}),Fs=uu(Oo),Ns=gi(function(n,t){var r=null==n?0:n.length,e=Tr(n,t);return nu(n,c(t,function(n){return Ci(n,r)?+n:n}).sort(Lu)),e}),Ps=uu(function(n){
    return gu(ee(n,1,Jf,!0))}),qs=uu(function(n){var t=jo(n);return Jf(t)&&(t=X),gu(ee(n,1,Jf,!0),mi(t,2))}),Zs=uu(function(n){var t=jo(n);return t="function"==typeof t?t:X,gu(ee(n,1,Jf,!0),X,t)}),Ks=uu(function(n,t){return Jf(n)?Hr(n,t):[]}),Vs=uu(function(n){return mu(i(n,Jf))}),Gs=uu(function(n){var t=jo(n);return Jf(t)&&(t=X),mu(i(n,Jf),mi(t,2))}),Hs=uu(function(n){var t=jo(n);return t="function"==typeof t?t:X,mu(i(n,Jf),X,t)}),Js=uu(Go),Ys=uu(function(n){var t=n.length,r=t>1?n[t-1]:X;return r="function"==typeof r?(n.pop(),
    r):X,Ho(n,r)}),Qs=gi(function(n){var t=n.length,r=t?n[0]:0,e=this.__wrapped__,u=function(t){return Tr(t,n)};return!(t>1||this.__actions__.length)&&e instanceof Ct&&Ci(r)?(e=e.slice(r,+r+(t?1:0)),e.__actions__.push({func:nf,args:[u],thisArg:X}),new Y(e,this.__chain__).thru(function(n){return t&&!n.length&&n.push(X),n})):this.thru(u)}),Xs=Fu(function(n,t,r){bl.call(n,r)?++n[r]:Br(n,r,1)}),nh=Ju(ho),th=Ju(po),rh=Fu(function(n,t,r){bl.call(n,r)?n[r].push(t):Br(n,r,[t])}),eh=uu(function(t,r,e){var u=-1,i="function"==typeof r,o=Hf(t)?il(t.length):[];
    return ys(t,function(t){o[++u]=i?n(r,t,e):Ie(t,r,e)}),o}),uh=Fu(function(n,t,r){Br(n,r,t)}),ih=Fu(function(n,t,r){n[r?0:1].push(t)},function(){return[[],[]]}),oh=uu(function(n,t){if(null==n)return[];var r=t.length;return r>1&&Ui(n,t[0],t[1])?t=[]:r>2&&Ui(t[0],t[1],t[2])&&(t=[t[0]]),He(n,ee(t,1),[])}),fh=Dl||function(){return re.Date.now()},ch=uu(function(n,t,r){var e=_n;if(r.length){var u=N(r,wi(ch));e|=bn}return ai(n,e,t,r,u)}),ah=uu(function(n,t,r){var e=_n|vn;if(r.length){var u=N(r,wi(ah));e|=bn;
    }return ai(t,e,n,r,u)}),lh=uu(function(n,t){return Gr(n,1,t)}),sh=uu(function(n,t,r){return Gr(n,Ic(t)||0,r)});Cf.Cache=sr;var hh=js(function(t,r){r=1==r.length&&bh(r[0])?c(r[0],z(mi())):c(ee(r,1),z(mi()));var e=r.length;return uu(function(u){for(var i=-1,o=Hl(u.length,e);++i<o;)u[i]=r[i].call(this,u[i]);return n(t,this,u)})}),ph=uu(function(n,t){return ai(n,bn,X,t,N(t,wi(ph)))}),_h=uu(function(n,t){return ai(n,wn,X,t,N(t,wi(_h)))}),vh=gi(function(n,t){return ai(n,xn,X,X,X,t)}),gh=ii(me),yh=ii(function(n,t){
    return n>=t}),dh=Re(function(){return arguments}())?Re:function(n){return cc(n)&&bl.call(n,"callee")&&!Wl.call(n,"callee")},bh=il.isArray,wh=ce?z(ce):ze,mh=ql||qa,xh=ae?z(ae):Ee,jh=le?z(le):Le,Ah=se?z(se):Be,kh=he?z(he):Te,Oh=pe?z(pe):$e,Ih=ii(Ne),Rh=ii(function(n,t){return n<=t}),zh=Nu(function(n,t){if(Mi(t)||Hf(t))return $u(t,Pc(t),n),X;for(var r in t)bl.call(t,r)&&Sr(n,r,t[r])}),Eh=Nu(function(n,t){$u(t,qc(t),n)}),Sh=Nu(function(n,t,r,e){$u(t,qc(t),n,e)}),Wh=Nu(function(n,t,r,e){$u(t,Pc(t),n,e);
    }),Lh=gi(Tr),Ch=uu(function(n,t){n=ll(n);var r=-1,e=t.length,u=e>2?t[2]:X;for(u&&Ui(t[0],t[1],u)&&(e=1);++r<e;)for(var i=t[r],o=qc(i),f=-1,c=o.length;++f<c;){var a=o[f],l=n[a];(l===X||Gf(l,gl[a])&&!bl.call(n,a))&&(n[a]=i[a])}return n}),Uh=uu(function(t){return t.push(X,si),n(Mh,X,t)}),Bh=Xu(function(n,t,r){null!=t&&"function"!=typeof t.toString&&(t=xl.call(t)),n[t]=r},Sa(La)),Th=Xu(function(n,t,r){null!=t&&"function"!=typeof t.toString&&(t=xl.call(t)),bl.call(n,t)?n[t].push(r):n[t]=[r]},mi),$h=uu(Ie),Dh=Nu(function(n,t,r){
    Ke(n,t,r)}),Mh=Nu(function(n,t,r,e){Ke(n,t,r,e)}),Fh=gi(function(n,t){var r={};if(null==n)return r;var e=!1;t=c(t,function(t){return t=ku(t,n),e||(e=t.length>1),t}),$u(n,di(n),r),e&&(r=Fr(r,an|ln|sn,hi));for(var u=t.length;u--;)yu(r,t[u]);return r}),Nh=gi(function(n,t){return null==n?{}:Je(n,t)}),Ph=ci(Pc),qh=ci(qc),Zh=Vu(function(n,t,r){return t=t.toLowerCase(),n+(r?fa(t):t)}),Kh=Vu(function(n,t,r){return n+(r?"-":"")+t.toLowerCase()}),Vh=Vu(function(n,t,r){return n+(r?" ":"")+t.toLowerCase()}),Gh=Ku("toLowerCase"),Hh=Vu(function(n,t,r){
    return n+(r?"_":"")+t.toLowerCase()}),Jh=Vu(function(n,t,r){return n+(r?" ":"")+Qh(t)}),Yh=Vu(function(n,t,r){return n+(r?" ":"")+t.toUpperCase()}),Qh=Ku("toUpperCase"),Xh=uu(function(t,r){try{return n(t,X,r)}catch(n){return rc(n)?n:new fl(n)}}),np=gi(function(n,t){return r(t,function(t){t=no(t),Br(n,t,ch(n[t],n))}),n}),tp=Yu(),rp=Yu(!0),ep=uu(function(n,t){return function(r){return Ie(r,n,t)}}),up=uu(function(n,t){return function(r){return Ie(n,r,t)}}),ip=ti(c),op=ti(u),fp=ti(h),cp=ui(),ap=ui(!0),lp=ni(function(n,t){
    return n+t},0),sp=fi("ceil"),hp=ni(function(n,t){return n/t},1),pp=fi("floor"),_p=ni(function(n,t){return n*t},1),vp=fi("round"),gp=ni(function(n,t){return n-t},0);return Z.after=If,Z.ary=Rf,Z.assign=zh,Z.assignIn=Eh,Z.assignInWith=Sh,Z.assignWith=Wh,Z.at=Lh,Z.before=zf,Z.bind=ch,Z.bindAll=np,Z.bindKey=ah,Z.castArray=Nf,Z.chain=Qo,Z.chunk=uo,Z.compact=io,Z.concat=oo,Z.cond=za,Z.conforms=Ea,Z.constant=Sa,Z.countBy=Xs,Z.create=Sc,Z.curry=Ef,Z.curryRight=Sf,Z.debounce=Wf,Z.defaults=Ch,Z.defaultsDeep=Uh,
    Z.defer=lh,Z.delay=sh,Z.difference=Us,Z.differenceBy=Bs,Z.differenceWith=Ts,Z.drop=fo,Z.dropRight=co,Z.dropRightWhile=ao,Z.dropWhile=lo,Z.fill=so,Z.filter=lf,Z.flatMap=sf,Z.flatMapDeep=hf,Z.flatMapDepth=pf,Z.flatten=_o,Z.flattenDeep=vo,Z.flattenDepth=go,Z.flip=Lf,Z.flow=tp,Z.flowRight=rp,Z.fromPairs=yo,Z.functions=$c,Z.functionsIn=Dc,Z.groupBy=rh,Z.initial=mo,Z.intersection=$s,Z.intersectionBy=Ds,Z.intersectionWith=Ms,Z.invert=Bh,Z.invertBy=Th,Z.invokeMap=eh,Z.iteratee=Ca,Z.keyBy=uh,Z.keys=Pc,Z.keysIn=qc,
    Z.map=yf,Z.mapKeys=Zc,Z.mapValues=Kc,Z.matches=Ua,Z.matchesProperty=Ba,Z.memoize=Cf,Z.merge=Dh,Z.mergeWith=Mh,Z.method=ep,Z.methodOf=up,Z.mixin=Ta,Z.negate=Uf,Z.nthArg=Ma,Z.omit=Fh,Z.omitBy=Vc,Z.once=Bf,Z.orderBy=df,Z.over=ip,Z.overArgs=hh,Z.overEvery=op,Z.overSome=fp,Z.partial=ph,Z.partialRight=_h,Z.partition=ih,Z.pick=Nh,Z.pickBy=Gc,Z.property=Fa,Z.propertyOf=Na,Z.pull=Fs,Z.pullAll=Oo,Z.pullAllBy=Io,Z.pullAllWith=Ro,Z.pullAt=Ns,Z.range=cp,Z.rangeRight=ap,Z.rearg=vh,Z.reject=mf,Z.remove=zo,Z.rest=Tf,
    Z.reverse=Eo,Z.sampleSize=jf,Z.set=Jc,Z.setWith=Yc,Z.shuffle=Af,Z.slice=So,Z.sortBy=oh,Z.sortedUniq=$o,Z.sortedUniqBy=Do,Z.split=da,Z.spread=$f,Z.tail=Mo,Z.take=Fo,Z.takeRight=No,Z.takeRightWhile=Po,Z.takeWhile=qo,Z.tap=Xo,Z.throttle=Df,Z.thru=nf,Z.toArray=jc,Z.toPairs=Ph,Z.toPairsIn=qh,Z.toPath=Ha,Z.toPlainObject=Rc,Z.transform=Qc,Z.unary=Mf,Z.union=Ps,Z.unionBy=qs,Z.unionWith=Zs,Z.uniq=Zo,Z.uniqBy=Ko,Z.uniqWith=Vo,Z.unset=Xc,Z.unzip=Go,Z.unzipWith=Ho,Z.update=na,Z.updateWith=ta,Z.values=ra,Z.valuesIn=ea,
    Z.without=Ks,Z.words=Ra,Z.wrap=Ff,Z.xor=Vs,Z.xorBy=Gs,Z.xorWith=Hs,Z.zip=Js,Z.zipObject=Jo,Z.zipObjectDeep=Yo,Z.zipWith=Ys,Z.entries=Ph,Z.entriesIn=qh,Z.extend=Eh,Z.extendWith=Sh,Ta(Z,Z),Z.add=lp,Z.attempt=Xh,Z.camelCase=Zh,Z.capitalize=fa,Z.ceil=sp,Z.clamp=ua,Z.clone=Pf,Z.cloneDeep=Zf,Z.cloneDeepWith=Kf,Z.cloneWith=qf,Z.conformsTo=Vf,Z.deburr=ca,Z.defaultTo=Wa,Z.divide=hp,Z.endsWith=aa,Z.eq=Gf,Z.escape=la,Z.escapeRegExp=sa,Z.every=af,Z.find=nh,Z.findIndex=ho,Z.findKey=Wc,Z.findLast=th,Z.findLastIndex=po,
    Z.findLastKey=Lc,Z.floor=pp,Z.forEach=_f,Z.forEachRight=vf,Z.forIn=Cc,Z.forInRight=Uc,Z.forOwn=Bc,Z.forOwnRight=Tc,Z.get=Mc,Z.gt=gh,Z.gte=yh,Z.has=Fc,Z.hasIn=Nc,Z.head=bo,Z.identity=La,Z.includes=gf,Z.indexOf=wo,Z.inRange=ia,Z.invoke=$h,Z.isArguments=dh,Z.isArray=bh,Z.isArrayBuffer=wh,Z.isArrayLike=Hf,Z.isArrayLikeObject=Jf,Z.isBoolean=Yf,Z.isBuffer=mh,Z.isDate=xh,Z.isElement=Qf,Z.isEmpty=Xf,Z.isEqual=nc,Z.isEqualWith=tc,Z.isError=rc,Z.isFinite=ec,Z.isFunction=uc,Z.isInteger=ic,Z.isLength=oc,Z.isMap=jh,
    Z.isMatch=ac,Z.isMatchWith=lc,Z.isNaN=sc,Z.isNative=hc,Z.isNil=_c,Z.isNull=pc,Z.isNumber=vc,Z.isObject=fc,Z.isObjectLike=cc,Z.isPlainObject=gc,Z.isRegExp=Ah,Z.isSafeInteger=yc,Z.isSet=kh,Z.isString=dc,Z.isSymbol=bc,Z.isTypedArray=Oh,Z.isUndefined=wc,Z.isWeakMap=mc,Z.isWeakSet=xc,Z.join=xo,Z.kebabCase=Kh,Z.last=jo,Z.lastIndexOf=Ao,Z.lowerCase=Vh,Z.lowerFirst=Gh,Z.lt=Ih,Z.lte=Rh,Z.max=Ya,Z.maxBy=Qa,Z.mean=Xa,Z.meanBy=nl,Z.min=tl,Z.minBy=rl,Z.stubArray=Pa,Z.stubFalse=qa,Z.stubObject=Za,Z.stubString=Ka,
    Z.stubTrue=Va,Z.multiply=_p,Z.nth=ko,Z.noConflict=$a,Z.noop=Da,Z.now=fh,Z.pad=ha,Z.padEnd=pa,Z.padStart=_a,Z.parseInt=va,Z.random=oa,Z.reduce=bf,Z.reduceRight=wf,Z.repeat=ga,Z.replace=ya,Z.result=Hc,Z.round=vp,Z.runInContext=p,Z.sample=xf,Z.size=kf,Z.snakeCase=Hh,Z.some=Of,Z.sortedIndex=Wo,Z.sortedIndexBy=Lo,Z.sortedIndexOf=Co,Z.sortedLastIndex=Uo,Z.sortedLastIndexBy=Bo,Z.sortedLastIndexOf=To,Z.startCase=Jh,Z.startsWith=ba,Z.subtract=gp,Z.sum=el,Z.sumBy=ul,Z.template=wa,Z.times=Ga,Z.toFinite=Ac,Z.toInteger=kc,
    Z.toLength=Oc,Z.toLower=ma,Z.toNumber=Ic,Z.toSafeInteger=zc,Z.toString=Ec,Z.toUpper=xa,Z.trim=ja,Z.trimEnd=Aa,Z.trimStart=ka,Z.truncate=Oa,Z.unescape=Ia,Z.uniqueId=Ja,Z.upperCase=Yh,Z.upperFirst=Qh,Z.each=_f,Z.eachRight=vf,Z.first=bo,Ta(Z,function(){var n={};return ue(Z,function(t,r){bl.call(Z.prototype,r)||(n[r]=t)}),n}(),{chain:!1}),Z.VERSION=nn,r(["bind","bindKey","curry","curryRight","partial","partialRight"],function(n){Z[n].placeholder=Z}),r(["drop","take"],function(n,t){Ct.prototype[n]=function(r){
    r=r===X?1:Gl(kc(r),0);var e=this.__filtered__&&!t?new Ct(this):this.clone();return e.__filtered__?e.__takeCount__=Hl(r,e.__takeCount__):e.__views__.push({size:Hl(r,Un),type:n+(e.__dir__<0?"Right":"")}),e},Ct.prototype[n+"Right"]=function(t){return this.reverse()[n](t).reverse()}}),r(["filter","map","takeWhile"],function(n,t){var r=t+1,e=r==Rn||r==En;Ct.prototype[n]=function(n){var t=this.clone();return t.__iteratees__.push({iteratee:mi(n,3),type:r}),t.__filtered__=t.__filtered__||e,t}}),r(["head","last"],function(n,t){
    var r="take"+(t?"Right":"");Ct.prototype[n]=function(){return this[r](1).value()[0]}}),r(["initial","tail"],function(n,t){var r="drop"+(t?"":"Right");Ct.prototype[n]=function(){return this.__filtered__?new Ct(this):this[r](1)}}),Ct.prototype.compact=function(){return this.filter(La)},Ct.prototype.find=function(n){return this.filter(n).head()},Ct.prototype.findLast=function(n){return this.reverse().find(n)},Ct.prototype.invokeMap=uu(function(n,t){return"function"==typeof n?new Ct(this):this.map(function(r){
    return Ie(r,n,t)})}),Ct.prototype.reject=function(n){return this.filter(Uf(mi(n)))},Ct.prototype.slice=function(n,t){n=kc(n);var r=this;return r.__filtered__&&(n>0||t<0)?new Ct(r):(n<0?r=r.takeRight(-n):n&&(r=r.drop(n)),t!==X&&(t=kc(t),r=t<0?r.dropRight(-t):r.take(t-n)),r)},Ct.prototype.takeRightWhile=function(n){return this.reverse().takeWhile(n).reverse()},Ct.prototype.toArray=function(){return this.take(Un)},ue(Ct.prototype,function(n,t){var r=/^(?:filter|find|map|reject)|While$/.test(t),e=/^(?:head|last)$/.test(t),u=Z[e?"take"+("last"==t?"Right":""):t],i=e||/^find/.test(t);
    u&&(Z.prototype[t]=function(){var t=this.__wrapped__,o=e?[1]:arguments,f=t instanceof Ct,c=o[0],l=f||bh(t),s=function(n){var t=u.apply(Z,a([n],o));return e&&h?t[0]:t};l&&r&&"function"==typeof c&&1!=c.length&&(f=l=!1);var h=this.__chain__,p=!!this.__actions__.length,_=i&&!h,v=f&&!p;if(!i&&l){t=v?t:new Ct(this);var g=n.apply(t,o);return g.__actions__.push({func:nf,args:[s],thisArg:X}),new Y(g,h)}return _&&v?n.apply(this,o):(g=this.thru(s),_?e?g.value()[0]:g.value():g)})}),r(["pop","push","shift","sort","splice","unshift"],function(n){
    var t=_l[n],r=/^(?:push|sort|unshift)$/.test(n)?"tap":"thru",e=/^(?:pop|shift)$/.test(n);Z.prototype[n]=function(){var n=arguments;if(e&&!this.__chain__){var u=this.value();return t.apply(bh(u)?u:[],n)}return this[r](function(r){return t.apply(bh(r)?r:[],n)})}}),ue(Ct.prototype,function(n,t){var r=Z[t];if(r){var e=r.name+"";bl.call(fs,e)||(fs[e]=[]),fs[e].push({name:t,func:r})}}),fs[Qu(X,vn).name]=[{name:"wrapper",func:X}],Ct.prototype.clone=$t,Ct.prototype.reverse=Yt,Ct.prototype.value=Qt,Z.prototype.at=Qs,
    Z.prototype.chain=tf,Z.prototype.commit=rf,Z.prototype.next=ef,Z.prototype.plant=of,Z.prototype.reverse=ff,Z.prototype.toJSON=Z.prototype.valueOf=Z.prototype.value=cf,Z.prototype.first=Z.prototype.head,Ul&&(Z.prototype[Ul]=uf),Z},be=de();"function"==typeof define&&"object"==typeof define.amd&&define.amd?(re._=be,define(function(){return be})):ue?((ue.exports=be)._=be,ee._=be):re._=be}).call(this);