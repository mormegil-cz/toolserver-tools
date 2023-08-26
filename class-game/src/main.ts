import * as Toastify from 'toastify-js';
import * as vis from 'vis-network/standalone';

const ROOT_CLASS = 'Q35120';

const $: (elementId: string) => HTMLElement | null = document.getElementById.bind(document);

let classData: WDClassesSet = undefined;
let classIndex: string[] = undefined;

let seekedQid: string = undefined;

const visibleClasses = new Set<string>();
const parentsOfVisible = new Set<string>();

const treeNodes = new vis.DataSet<vis.Node>([]);
const treeEdges = new vis.DataSet<vis.Edge>([]);

const treeOptions: vis.Options = {
    layout: {
        hierarchical: {
            enabled: true
        }
    }
};
const treeData: vis.Data = {
    nodes: treeNodes,
    edges: treeEdges
};
const treeNetwork = new vis.Network($('display'), treeData, treeOptions);
treeNetwork.on('click', networkClicked);

interface WDClassInfo {
    l: string;
    s: string[];
}

interface WDClassesSet {
    [qid: string]: WDClassInfo;
}

function rerenderTree() {
    treeEdges.clear();
    treeNodes.clear();

    for (const cls of visibleClasses) {
        const node = <vis.Node>{id: cls};
        if (cls === seekedQid) {
            // TODO: Finished game flag displaying the label
            node.label = '?';
        } else if (cls === ROOT_CLASS) {
            node.label = classData[cls].l;
            node.title = cls;
        } else {
            node.label = classData[cls].l;
            node.title = cls;
        }
        treeNodes.add(node);
    }

    // and now add the appropriate link for each node in the tree (except the root, obviously)
    for (const cls of visibleClasses) {
        if (cls === ROOT_CLASS) continue;

        const parent = breadthFirstSearch(cls, visibleClasses);
        treeEdges.add(<vis.Edge>{
            from: cls,
            to: parent,
            arrows: { to: true }
        });
    }
}

function breadthFirstSearch(from: string, toSet: Set<string>): string {
    const queue: string[] = [from];
    let pos = 0;
    const visited = new Set<string>();
    while (pos < queue.length) {
        let curr = queue[pos++];
        if (curr !== from && toSet.has(curr)) {
            console.debug("Path from", from, classData[from].l, "leads through", curr, classData[curr].l);
            return curr;
        }
        if (visited.has(curr)) {
            continue;
        }
        visited.add(curr);
        if (!classData[curr]) {
            console.error("No data for class " + curr);
            toastError("Unexpected error! Missing data!");
            continue;
        }
        for (let parent of classData[curr].s) {
            queue.push(parent);
        }
    }
    // what!
    console.error("Unable to find path", from, toSet);
    toastError("Unexpected error! Disconnected graph!");
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
    const $btnAddRandom = $('btnAddRandom') as HTMLButtonElement;
    $btnAddRandom.addEventListener('click', addRandomHint);

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

function initClassData(data: WDClassesSet) {
    classData = data;
    classIndex = Object.keys(data);
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
    console.debug("Starting new game; seeking", seekedQid, classData[seekedQid].l);

    visibleClasses.clear();
    parentsOfVisible.clear();

    visibleClasses.add(ROOT_CLASS);
    visibleClasses.add(seekedQid);

    parentsOfVisible.add(ROOT_CLASS);
    addAllParentsOfVisible(seekedQid);

    rerenderTree();
    
    toastInfo("New game ready");
}

function addAllParentsOfVisible(start: string) {
    const stack = [start];
    while (stack.length) {
        const curr = stack.pop();
        parentsOfVisible.add(curr);
        const currClass = classData[curr];
        if (!currClass) {
            console.error("No data for class " + curr);
            toastError("Unexpected error! Missing data!");
            continue;
        }
        for (const parent of currClass.s) {
            stack.push(parent);
        }
    }
}

function addAttemptedClass(chosenQid: string) {
    console.debug("Adding", chosenQid, classData[chosenQid].l);
    visibleClasses.add(chosenQid);

    // and now choose _another_ class, which is the nearest parent of the chosen class and _any_ of the visible classes
    const nearestPredecessor = breadthFirstSearch(chosenQid, parentsOfVisible);
    if (nearestPredecessor === ROOT_CLASS) {
        console.debug("Oops, no common path to root!");
    } else {
        visibleClasses.add(nearestPredecessor);
    }

    for (const pv of parentsOfVisible) {
        console.debug(pv, classData[pv]);
    }
    addAllParentsOfVisible(chosenQid);
    rerenderTree();
}

function addRandomHint() {
    let chosenQid: string;
    do {
        const idx = Math.floor(classIndex.length * Math.random());
        chosenQid = classIndex[idx];
    } while (visibleClasses.has(chosenQid));
    addAttemptedClass(chosenQid);
}

function networkClicked(evt: any) {
    if (!evt.nodes || !evt.nodes.length) return;

    const clickedClass = evt.nodes[0];
    if (clickedClass === seekedQid) {
        // ha!
        toastInfo('Yeah, that one you need to find out!');
        // TODO: Finished game flag
        return;
    }

    window.open(`https://www.wikidata.org/wiki/${clickedClass}`);
}

window.onload = init;
