import * as Toastify from 'toastify-js';
import * as vis from 'vis-network/standalone';
import autocomplete from 'autocompleter';
import TrieSearch from 'trie-search';

const ROOT_CLASS = 'Q35120';

const COLOR_SEEKED = '#ffcccc';
const COLOR_ROOT = 'lightblue';

const $: (elementId: string) => HTMLElement | null = document.getElementById.bind(document);

let classData: WDClassesSet = undefined;
let classIndex: string[] = undefined;
let classNameTrie: TrieSearch<WDClassAutocomplete> = undefined;

let seekedQid: string | undefined = undefined;
let gameFinished: boolean = undefined;
let moveCounter: number = undefined;

const visibleClasses = new Set<string>();
const parentsOfVisible = new Set<string>();

const treeNodeIndex = new Map<string, VisTreeNode>();
const treeEdgeIndex = new Map<string, vis.Edge>();

const treeNodes = new vis.DataSet<VisTreeNode>([]);
const treeEdges = new vis.DataSet<VisTreeEdge>([]);

const treeOptions: vis.Options = {
    layout: {
        hierarchical: {
            enabled: false
        }
    }
};
const treeData: vis.Data = {
    nodes: treeNodes,
    edges: treeEdges
};
const treeNetwork = new vis.Network($('display'), treeData, treeOptions);
treeNetwork.on('click', networkClicked);
// treeNetwork.on('doubleClick', networkDoubleClicked);
// TODO: Right click to remove useless nodes (?)

interface VisTreeNode {
    id: string;
    label: string;
    title?: string;
    color: string;
}

interface VisTreeEdge {
    id: string;
    from: string,
    to: string;
    arrows: { to: boolean }
}

interface WDClassAutocomplete {
    qid: string;
    qidNum: number;
    label: string;
}

interface WDClassInfo {
    l: string;
    s: string[];
}

interface WDClassesSet {
    [qid: string]: WDClassInfo;
}

function updateGraph() {
    const prevNodes = new Map<string, boolean>();
    for (const n of treeNodes.stream()) prevNodes.set(n[1].id, false);

    for (const cls of visibleClasses) {
        if (prevNodes.has(cls) && !(gameFinished && cls === seekedQid)) {
            prevNodes.set(cls, true);
        } else {
            const node = <VisTreeNode>{ id: cls };
            if (cls === seekedQid) {
                node.label = gameFinished ? classData[cls].l : '?';
                node.color = COLOR_SEEKED;
            } else if (cls === ROOT_CLASS) {
                node.label = classData[cls].l;
                node.title = cls;
                node.color = COLOR_ROOT;
            } else {
                node.label = classData[cls].l;
            }
            if (!prevNodes.has(cls)) treeNodes.add(node);
            else treeNodes.update(node);
            prevNodes.set(cls, true);
        }
    }

    // and now add the appropriate link for each node in the tree (except the root, obviously)
    const prevEdges = new Map<string, boolean>();
    for (const e of treeEdges.stream()) prevEdges.set(e[1].id, false);

    for (const cls of visibleClasses) {
        if (cls === ROOT_CLASS) continue;

        const parents = breadthFirstSearch(cls, visibleClasses);
        for (const parent of parents) {
            const edgeId = `${cls}-${parent}`;
            if (prevEdges.has(edgeId)) {
                prevEdges.set(edgeId, true);
            } else {
                treeEdges.add(<VisTreeEdge>{
                    id: edgeId,
                    from: cls,
                    to: parent,
                    arrows: { to: true }
                });
            }
        }
    }

    // now remove old (removed) edges
    for (const e of prevEdges) {
        if (!e[1]) treeEdges.remove(e[0]);
    }
    // and nodes
    for (const n of prevNodes) {
        if (!n[1]) treeNodes.remove(n[0]);
    }
}

function breadthFirstSearch(from: string, toSet: Set<string>): Set<string> {
    const queue: string[] = [from];
    let pos = 0;
    const result = new Set<string>();
    const visited = new Set<string>();
    while (pos < queue.length) {
        let curr = queue[pos++];
        if (curr !== from && toSet.has(curr)) {
            console.debug("Path from", from, classData[from].l, "leads through", curr, classData[curr].l);
            result.add(curr);
            // do not continue through this path
            visited.add(curr);
            continue;
        }
        if (visited.has(curr)) {
            continue;
        }
        visited.add(curr);
        if (!classData[curr]) {
            console.error("No data for class " + curr);
            continue;
        }
        for (let parent of classData[curr].s) {
            queue.push(parent);
        }
    }
    if (!result.size) {
        // what!
        console.error("Unable to find path", from, toSet);
    }
    return result;
}

function showToast(msg: string, className: string) {
    Toastify({
        text: msg,
        className: className
    }).showToast();
}

function toastInfo(msg: string) {
    showToast(msg, 'info');
}

function toastWarning(msg: string) {
    showToast(msg, 'warning');
}

function toastError(msg: string) {
    showToast(msg, 'error');
}

function init() {
    const $btnNewGame = $('btnNewGame') as HTMLButtonElement;
    $btnNewGame.addEventListener('click', requestStartNewGame);
    const $btnAddHint = $('btnAddHint') as HTMLButtonElement;
    $btnAddHint.addEventListener('click', addHint);
    const $editGuess = $('editGuess') as HTMLInputElement;
    autocomplete({
        input: $editGuess,
        fetch: function (text, update) {
            const results = classNameTrie.search(text);
            results.sort((a, b) => a.qidNum - b.qidNum);
            update(results);
        },
        onSelect: function (item: WDClassAutocomplete) {
            $editGuess.value = '';
            addGuess(item);
        }
    });

    const $spinner = $('spinner');

    fetch('assets/classes.json')
        .then(response => {
            if (response.status !== 200) {
                return response.text()
                    .then(errText => {
                        console.error('Unexpected HTTP status code when fetching classes');
                        throw errText;
                    });
            }

            return response.json();
        })
        .then((data: WDClassesSet) => {
            classData = data;
            initClassData(data);
            startNewGame();
            $spinner.style.display = 'none';
        })
        .catch(err => {
            console.error(err);
            toastError("Error loading class data: " + err);
            $spinner.style.display = 'none';
        });

}

function addGuess(item: WDClassAutocomplete) {
    const chosenQid = item.qid;
    if (chosenQid === seekedQid) {
        // done!
        gameFinished = true;
        toastInfo('Great! You have won in ' + moveCounter + ' move' + (moveCounter === 1 ? '' : 's'));
        updateGraph();
        seekedQid = undefined;
        return;
    }
    if (visibleClasses.has(chosenQid)) {
        toastWarning(classData[chosenQid].l + ' is already visible!');
        return;
    }
    addAttemptedClass(chosenQid);
}

function initClassData(data: WDClassesSet) {
    classData = data;
    classIndex = Object.keys(data);

    classNameTrie = new TrieSearch<WDClassAutocomplete>('label', {
        min: 2,
        ignoreCase: true,
        splitOnRegEx: false,
        indexField: 'qid'
    });
    for (const qid of classIndex) {
        classNameTrie.add({
            qid: qid,
            qidNum: parseInt(qid.substring(1), 10),
            label: buildFullLabel(qid)
        });
    }

    validateClassData();
}

function buildFullLabel(qid: string) {
    const data = classData[qid];
    if (!data) {
        console.warn('No class data for', qid);
        return qid;
    }
    const labelParts = [data.l];
    if (data.s.length) {
        labelParts.push(' (');
        let first = true;
        for (const superclass of data.s) {
            if (!first) labelParts.push(', ');
            first = false;
            const superdata = classData[superclass];
            if (!superdata) {
                console.warn('No superclass', superclass, 'of', qid);
                continue;
            }
            labelParts.push(superdata.l);
        }
        labelParts.push(')');
    }
    return labelParts.join('');
}

function requestStartNewGame() {
    if (seekedQid) {
        if (!confirm("Are you sure you want to abandon the current game?")) return;

        toastInfo(`The solution you have failed to find was: ${classData[seekedQid].l} (${seekedQid})`);
        seekedQid = undefined;
    }

    startNewGame();
}

function startNewGame() {
    let idx = Math.floor(classIndex.length * Math.random());
    seekedQid = classIndex[idx];
    gameFinished = false;
    moveCounter = 0;
    console.debug("Starting new game; seeking", seekedQid, classData[seekedQid].l);

    visibleClasses.clear();
    parentsOfVisible.clear();

    visibleClasses.add(ROOT_CLASS);
    visibleClasses.add(seekedQid);

    parentsOfVisible.add(ROOT_CLASS);
    addAllParentsOfVisible(seekedQid);

    updateGraph();

    toastInfo("New game ready");
}

function addAllParentsOfVisible(start: string) {
    const processed = new Set<string>();
    const stack = [start];
    while (stack.length) {
        const curr = stack.pop();
        if (processed.has(curr)) continue;
        processed.add(curr);
        parentsOfVisible.add(curr);
        const currClass = classData[curr];
        if (!currClass) {
            console.error("No data for class " + curr);
            continue;
        }
        for (const parent of currClass.s) {
            stack.push(parent);
        }
    }
}

function addAttemptedClass(chosenQid: string) {
    ++moveCounter;
    console.debug("Adding", chosenQid, classData[chosenQid].l);
    visibleClasses.add(chosenQid);

    // and now choose _another_ class, which is the nearest parent of the chosen class and _any_ of the visible classes
    const predecessors = breadthFirstSearch(chosenQid, parentsOfVisible);
    for (const predecessor of predecessors) {
        if (predecessor === seekedQid) {
            // oops, we don’t want to show this!
        } else if (predecessor === ROOT_CLASS) {
            if (predecessors.size === 1) {
                console.debug("Oops, no common path to root!");
            }
        } else {
            visibleClasses.add(predecessor);
            break;
        }
    }

    /*
    for (const pv of parentsOfVisible) {
        console.debug(pv, classData[pv]);
    }
    */
    addAllParentsOfVisible(chosenQid);
    updateGraph();
}

function addHint() {
    const queue = [seekedQid];
    let queuePos = 0;
    const sortedParents = [];

    // Find the furthest not-yet visible “parent” of the seeked class and add it
    while (queuePos < queue.length) {
        const currQid = queue[queuePos++];
        const data = classData[currQid];
        if (!data) {
            console.error('No data for', currQid);
            continue;
        }
        for (const parent of data.s) {
            if (visibleClasses.has(parent)) {
                if (currQid !== seekedQid) sortedParents.push(currQid);
                continue;
            }
            queue.push(parent);
        }
    }

    if (sortedParents.length) {
        const chosenQid = sortedParents[sortedParents.length - 1];
        addAttemptedClass(chosenQid);
        toastInfo('See ' + classData[chosenQid].l);
        return;
    }

    // Oops… so… find the nearest not-yet visible “sibling” of the seeked class and add that

    toastWarning("Sorry, there is nothing to help you with");
}

function networkClicked(evt: any) {
    if (!evt.nodes || !evt.nodes.length) return;

    const clickedClass = evt.nodes[0];
    if (clickedClass === seekedQid && !gameFinished) {
        // ha!
        toastInfo('Yeah, that one you need to find out!');
        return;
    }

    window.open(`https://www.wikidata.org/wiki/${clickedClass}`);
}

function validateClassData() {
    let hasProblem = false;
    const missing = new Map<string, string[]>();
    for (const qid in classData) {
        const data = classData[qid];
        for (const parent of data.s) {
            if (parent === '') {
                // patch-up; TODO: clean original data and remove this
                classData[qid].s = [];
                break;
            }
            if (!classData[parent]) {
                const parentList = missing.get(parent) || [];
                parentList.push(qid);
                missing.set(parent, parentList);
            }
        }
        if (!data.s.length && qid !== ROOT_CLASS) {
            console.error("Class", qid, "has no parents!");
            hasProblem = true;
        }
    }
    for (const missingCls of missing.entries()) {
        console.error("Parent class", missingCls[0], "is missing, required by", missingCls[1].join(', '));
        hasProblem = true;
    }

    console.debug("Finding cycles...")
    for (const qid in classData) {
        findCyclesRec(qid);
    }
    if (cycleSet.size) {
        console.error("Cycles found!");
        for (const cycle of cycleSet) {
            console.log(cycle);
            hasProblem = true;
        }
    }
    if (hasProblem) {
        toastError("Detected problems in class data");
    }
}

const cameFrom = new Map<string, string>();
const cycleSet = new Set<string>();
function findCyclesRec(start: string) {
    const data = classData[start];
    if (!data) return;
    for (const parent of data.s) {
        if (cameFrom.has(parent)) {
            // cycle found!
            const cycleMembers = [];
            cycleMembers.push(parent);
            for (let pos = start; pos && pos !== parent; pos = cameFrom.get(pos)) {
                cycleMembers.push(pos);
            }
            cycleSet.add(sortCycleMembers(cycleMembers).join(' → '));
            continue;
        }

        cameFrom.set(parent, start);
        findCyclesRec(parent);
        cameFrom.delete(parent);
    }
}

function sortCycleMembers(xs: string[]): string[] {
    let minIdx = 0;
    let minValue = xs[0];
    for (let i = 1; i < xs.length; ++i) {
        if (xs[i] < minValue) {
            minValue = xs[i];
            minIdx = i;
        }
    }
    if (minIdx === 0) return xs;
    return xs.slice(minIdx).concat(xs.slice(0, minIdx));
}

window.onload = init;
