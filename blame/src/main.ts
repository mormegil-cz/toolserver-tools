import './scss/styles.scss'
import * as bootstrap from 'bootstrap'

enum Ordering {
    alpha = "alpha",
    chrono = "chrono"
};

// https://www.wikidata.org/w/api.php?action=query&format=json&origin=*&prop=revisions&formatversion=2&rvprop=ids%7Ctimestamp%7Cflags%7Ccomment%7Cuser%7Cparsedcomment%7Ccontent%7Cuserid&rvslots=main&rvlimit=10&titles=Q732678

let ordering = Ordering.chrono;
let data: BlameData | null = null;

class BlameData {
    constructor(public labels: Map<string, HistoryItem[]>, public claims: Map<string, HistoryItem[]>, public sitelinks: Map<string, HistoryItem[]>) {
    }
}

enum EditType {
    Created,
    Changed,
    Deleted,
    FirstRevision,
}

class HistoryItem {
    constructor(public revision: RevisionMetadata, public editType: EditType, public sizeChange: number) {
    }
}

class ItemState {
    constructor(public metadata: RevisionMetadata, public labels: Map<string, string>, public claims: Map<string, string>, public sitelinks: Map<string, string>) {
    }
}

class RevisionMetadata {
    constructor(public timestamp: string, public revisionId: string, public userName: string, public anonymousUser: boolean, public comment: string, public parsedComment: string, public minorEdit: boolean) {
    }
}

function init() {
    // reference bootstrap
    bootstrap.Dropdown.toString();

    document.querySelectorAll('#navComboOrdering a').forEach(elem => elem.addEventListener('click', handleOrderingChange));
    document.querySelectorAll('button[role=search]').forEach(elem => elem.addEventListener('click', handleLoadClick));

    renderScreen();
}

function handleLoadClick() {
    data = new BlameData(new Map(), new Map(), new Map());
    renderScreen();
}

function handleOrderingChange(this: HTMLElement) {
    ordering = <Ordering>this.getAttribute('data-ordering');
    refreshOrdering();
}

function refreshOrdering() {
    document.querySelectorAll('#navComboOrdering a').forEach(elem => {
        elem.classList.remove('active');
        elem.setAttribute('aria-current', 'false');
    });
    const $activeItem = document.querySelector(`#navComboOrdering a[data-ordering=${ordering}]`);
    $activeItem.classList.add('active');
    $activeItem.setAttribute('aria-current', 'true');
    renderScreen();
}

function renderScreen() {
    const $mainContainer = document.getElementById('mainContainer');
    if (data === null) {
        $mainContainer.style.display = 'none';
        document.getElementById('emptyScreen').style.display = 'block';
    } else {
        document.getElementById('emptyScreen').style.display = 'none';
        $mainContainer.style.display = 'none';
        renderData();
        $mainContainer.style.display = 'block';
    }
}

function renderData() {
    renderSection('sectionContentLabelling', data.labels);
    renderSection('sectionContentClaims', data.claims);
    renderSection('sectionContentSitelinks', data.sitelinks);
}

function renderSection(containerId: string, entries: Map<string, HistoryItem[]>) {
    const $container = document.getElementById(containerId);
    $container.innerHTML = '';
}

function processRevisions(revisions: Iterable<ItemState>): BlameData {
    let labelsHistory: Map<string, HistoryItem[]> = new Map();
    let claimsHistory: Map<string, HistoryItem[]> = new Map();
    let sitelinksHistory: Map<string, HistoryItem[]> = new Map();
    let currentState: ItemState | undefined = undefined;

    for (let revision of revisions) {
        if (currentState === undefined) {
            currentState = revision;
            continue;
        }

        appendHistory(labelsHistory, compareState(currentState.labels, revision.labels, currentState.metadata));
        appendHistory(claimsHistory, compareState(currentState.claims, revision.claims, currentState.metadata));
        appendHistory(sitelinksHistory, compareState(currentState.sitelinks, revision.sitelinks, currentState.metadata));

        currentState = revision;
    }

    return new BlameData(labelsHistory, claimsHistory, sitelinksHistory);
}

function appendHistory(history: Map<string, HistoryItem[]>, added: Map<string, HistoryItem>) {
    for (let addedKey of added.keys()) {
        let array = history.get(addedKey) ?? [];
        array.push(added.get(addedKey));
        history.set(addedKey, array);
    }
}

function compareState(current: Map<string, string>, previous: Map<string, string>, currentRevision: RevisionMetadata): Map<string, HistoryItem> {
    let result = new Map();

    let currentKeys = new Set(current.keys());
    let previousKeys = new Set(previous.keys());

    // added in current
    let addedKeys = new Set(currentKeys);
    previousKeys.forEach(addedKeys.delete);
    for (let addedKey of addedKeys) {
        result.set(addedKey, new HistoryItem(currentRevision, EditType.Created, current.get(addedKey).length));
    }

    // changed
    let changedKeys = new Set([...current.keys()].filter(previousKeys.has));
    for (let changedKey of changedKeys) {
        result.set(changedKey, new HistoryItem(currentRevision, EditType.Changed, current.get(changedKey).length - previous.get(changedKey).length));
    }

    // removed in current
    let removedKeys = new Set(previousKeys);
    currentKeys.forEach(previousKeys.delete);
    for (let removedKey of removedKeys) {
        result.set(removedKey, new HistoryItem(currentRevision, EditType.Deleted, -previous.get(removedKey).length));
    }

    return result;
}

window.onload = init;
