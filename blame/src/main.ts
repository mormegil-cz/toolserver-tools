import './scss/styles.scss'
import * as bootstrap from 'bootstrap'

enum Ordering {
    alpha = "alpha",
    chrono = "chrono"
};

let ordering = Ordering.chrono;
let data: BlameData | null = null;

enum ItemPart {
    Labels = "labels",
    Descriptions = "descriptions",
    Aliases = "aliases",
    Claims = "claims",
    Sitelinks = "sitelinks"
}

const itemPartValues = <ItemPart[]>Object.values(ItemPart);

class BlameData {
    constructor(public parts: Map<ItemPart, Map<string, HistoryItem[]>>) {
    }
}

enum EditType {
    Created,
    Changed,
    Deleted,
    FirstRevision,
}

const editTypeIcon = [
    'plus-square',
    'pencil-square',
    'x-square',
    'arrow-down-right-square'
];

class HistoryItem {
    constructor(public revision: RevisionMetadata, public editType: EditType, public sizeChange: number) {
    }
}

class ItemState {
    constructor(public metadata: RevisionMetadata, public parts: Map<ItemPart, Map<string, string>>) {
    }
}

class RevisionMetadata {
    constructor(public timestamp: string, public revisionId: number, public userName: string, public anonymousUser: boolean, public comment: string, public parsedComment: string, public minorEdit: boolean) {
    }
}

interface MWAPIQueryResponse {
    continue: {
        rvcontinue: string;
        continue: string;
    };
    query: {
        pages: {
            missing: boolean;
            pageid: number;
            ns: number;
            title: string;
            revisions: {
                revid: number;
                parentid: number;
                minor: boolean;
                anon: boolean;
                user: string;
                timestamp: string;
                slots: {
                    main: {
                        contentmodel: string;
                        contentformat: string;
                        content: string;
                    }
                };
                comment: string;
                parsedcomment: string;
            }[];
        }[];
    };
}

interface MWApiItemContent extends Record<ItemPart, { [entry: string]: object }> {
    type: string;
    id: string;
}

function init() {
    // reference bootstrap
    bootstrap.Dropdown.toString();

    document.querySelectorAll('#navComboOrdering a').forEach(elem => elem.addEventListener('click', handleOrderingChange));
    document.querySelectorAll('button[role=search]').forEach(elem => elem.addEventListener('click', handleLoadClick));

    renderScreen();
}

function reportError(error: string) {
    // TODO: Bootstrap error toast
    console.error(error);
}

let spinnerCounter = 0;
function showSpinner() {
    ++spinnerCounter;
    if (spinnerCounter === 1) {
        document.getElementById('spinner').style.display = 'block';
    }
}

function hideSpinner() {
    --spinnerCounter;
    if (spinnerCounter === 0) {
        document.getElementById('spinner').style.display = 'none';
    }
}

function handleLoadClick() {
    showSpinner();

    executeApiCall("Q732678")
        .then(showApiResponse)
        .catch(error => {
            console.error(error);
            reportError("Error loading/parsing item");
            hideSpinner();
        });
}

function showApiResponse(response: MWAPIQueryResponse) {
    if (!checkApiResponse(response)) {
        reportError("Unable to load item");
        hideSpinner();
        return;
    }

    data = processRevisions(parseApiResponse(response));
    renderScreen();
    hideSpinner();
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
    renderSection('sectionContentLabels', data.parts.get(ItemPart.Labels));
    renderSection('sectionContentDescriptions', data.parts.get(ItemPart.Descriptions));
    renderSection('sectionContentAliases', data.parts.get(ItemPart.Aliases));
    renderSection('sectionContentClaims', data.parts.get(ItemPart.Claims));
    renderSection('sectionContentSitelinks', data.parts.get(ItemPart.Sitelinks));
}

function $E(tag: string, properties: Record<string, string>, children: (HTMLElement | string)[]): HTMLElement {
    const el = document.createElement(tag);
    if (properties) {
        for (let prop in properties) {
            el.setAttribute(prop, properties[prop]);
        }
    }
    el.append(...children);
    return el;
}

function renderSection(containerId: string, entries: Map<string, HistoryItem[]>) {
    const $container = document.getElementById(containerId);
    $container.innerHTML = '';

    // TODO: Sorting

    for (let key of entries.keys()) {
        const data = entries.get(key);
        const id = `${containerId}-${key}`;
        const idHeading = `${id}-heading`;
        const idContent = `${id}-content`;
        const timeInfo = determineTimeInfo(data);

        const $historyRows: HTMLElement[] = [];

        for (let historyItem of data) {
            const revision = historyItem.revision;
            $historyRows.push(
                $E('tr', null, [
                    $E('td', null, [
                        $E('a', { href: `https://www.wikidata.org/w/index.php?diff=prev&oldid=${revision.revisionId}` }, [revision.timestamp])
                    ]),
                    $E('td', null, [
                        $E('a', { href: makeUserLink(revision.userName, revision.anonymousUser) }, [revision.userName])
                    ]),
                    $E('td', null, describeEdit(historyItem)),
                    $E('td', { class: 'font-monospace' }, [revision.comment]),
                ])
            );
        }

        $container.append(
            $E('div', { class: 'accordion', id: id }, [
                $E('div', { class: 'accordion-item' }, [
                    $E('h2', { class: 'accordion-header', id: idHeading }, [
                        $E('button', { class: 'accordion-button collapsed', type: 'button', 'data-bs-toggle': 'collapse', 'data-bs-target': `#${idContent}`, 'aria-expanded': 'false', 'aria-controls': idContent }, [
                            `${key} (${timeInfo})`
                        ])
                    ]),
                    $E('div', { class: 'accordion-collapse collapse', id: idContent, 'aria-labelledby': idHeading, 'data-bs-parent': `#${id}` }, [
                        $E('div', { class: 'accordion-body' }, [
                            $E('table', { class: 'table' }, [
                                $E('thead', null, [
                                    $E('tr', null, [
                                        $E('th', { scope: 'col' }, ['Timestamp']),
                                        $E('th', { scope: 'col' }, ['User']),
                                        $E('th', { scope: 'col' }, ['Operation']),
                                        $E('th', { scope: 'col' }, ['Comment']),
                                    ])
                                ]),
                                $E('tbody', null, $historyRows)
                            ])
                        ])
                    ])
                ])
            ])
        );
    }

    // TODO: Summary caption
}

function makeUserLink(userName: string, anonymous: boolean): string {
    return anonymous ? `https://www.wikidata.org/wiki/Special:Contributions/${userName}`
        : `https://www.wikidata.org/wiki/User:${userName}`;
}

function describeEdit(item: HistoryItem): (HTMLElement | string)[] {
    let diffSizeClass: string;
    let diffSizeText: string;
    if (item.sizeChange < 0) {
        diffSizeClass = 'danger';
        diffSizeText = '' + item.sizeChange;
    } else if (item.sizeChange > 0) {
        diffSizeClass = 'success';
        diffSizeText = '+' + item.sizeChange;
    } else {
        diffSizeClass = 'muted';
        diffSizeText = '±' + item.sizeChange;
    }
    let result = [
        $E('i', { class: `bi-${editTypeIcon[item.editType]}` }, []),
        ' ',
        $E('span', { class: `text-${diffSizeClass}` }, [diffSizeText])
    ];
    if (item.revision.minorEdit) {
        result.push(' ');
        result.push($E('span', { class: 'fw-bold' }, ['m']));
    }
    return result;
}

function determineTimeInfo(items: HistoryItem[]): string {
    switch (items.length) {
        case 0:
            // ?? should not happen
            return '?';

        case 1:
            return items[0].revision.timestamp;

        default:
            const latestRevision = items[0];
            const oldestRevision = items.at(-1);
            if (latestRevision.editType === EditType.Deleted) {
                return `${oldestRevision.revision.timestamp} – ${latestRevision.revision.timestamp}`;
            } else {
                return `since ${oldestRevision.revision.timestamp}`;
            }
    }
}

async function executeApiCall(qid: string): Promise<MWAPIQueryResponse> {
    const url = 'https://www.wikidata.org/w/api.php?action=query&format=json&origin=*&prop=revisions&formatversion=2&rvprop=ids%7Ctimestamp%7Cuser%7Ccontent%7Ccontentmodel%7Cparsedcomment%7Cflags&rvslots=main&rvlimit=20&titles=' + qid;
    return fetch(url)
        .then(response => {
            if (response.status !== 200) {
                return response.text()
                    .then(errText => {
                        console.error('Failed executing API request', response, errText);
                        throw new Error(errText);
                    });
            }
            return <Promise<MWAPIQueryResponse>>response.json();
        })
}

function checkApiResponse(response: MWAPIQueryResponse): boolean {
    if (!response?.query?.pages || response.query.pages.length != 1) {
        return false;
    }
    const pageData = response.query.pages[0];
    return !pageData.missing && !!pageData.pageid;
}

function* parseApiResponse(response: MWAPIQueryResponse): Iterable<ItemState> {
    const pageData = response.query.pages[0];

    for (let revisionData of pageData.revisions) {
        const mainSlot = revisionData.slots.main;
        if (mainSlot.contentformat !== 'application/json' || mainSlot.contentmodel !== 'wikibase-item') {
            console.warn(`Unsupported content of revision ${revisionData.revid}: '${mainSlot.contentformat}', '${mainSlot.contentmodel}'`);
            continue;
        }
        const metadata = new RevisionMetadata(revisionData.timestamp, revisionData.revid, revisionData.user, revisionData.anon ?? false, revisionData.comment, revisionData.parsedcomment, revisionData.minor);
        let revisionContent: any;
        try {
            revisionContent = JSON.parse(mainSlot.content);
        } catch (e) {
            console.warn(`Error parsing revision ${revisionData.revid}`, e);
            continue;
        }
        yield parseRevisionData(metadata, revisionContent);
    }
}

function parseRevisionData(metadata: RevisionMetadata, revision: MWApiItemContent): ItemState {
    let parts = new Map<ItemPart, Map<string, string>>();

    for (let part of itemPartValues) {
        let parsedPart = new Map<string, string>();
        let revisionPart = revision[part];

        for (let entryKey of Object.keys(revisionPart)) {
            let entryData = revisionPart[entryKey];
            let entryStr = JSON.stringify(entryData);
            parsedPart.set(entryKey, entryStr);
        }

        parts.set(part, parsedPart);
    }

    return new ItemState(metadata, parts)
}

function getOrInsert<K, V>(map: Map<K, V>, key: K, ctor: { new(): V }): V {
    let result = map.get(key);
    if (result !== undefined) {
        return result;
    }
    result = new ctor();
    map.set(key, result);
    return result;
}

function processRevisions(revisions: Iterable<ItemState>): BlameData {
    let parts = new Map<ItemPart, Map<string, HistoryItem[]>>();
    let currentState: ItemState | undefined = undefined;

    for (let revision of revisions) {
        if (currentState === undefined) {
            currentState = revision;
            continue;
        }

        for (let part of itemPartValues) {
            appendHistory(
                getOrInsert(parts, part, Map<string, HistoryItem[]>),
                compareState(currentState.parts.get(part), revision.parts.get(part), currentState.metadata)
            );
        }

        currentState = revision;
    }

    if (currentState !== undefined) {
        for (let part of itemPartValues) {
            appendHistory(
                getOrInsert(parts, part, Map<string, HistoryItem[]>),
                convertBaseItemState(currentState.metadata, currentState.parts.get(part))
            );
        }
    }

    return new BlameData(parts);
}

function appendHistory(history: Map<string, HistoryItem[]>, added: Map<string, HistoryItem>) {
    for (let addedKey of added.keys()) {
        let array = history.get(addedKey) ?? [];
        array.push(added.get(addedKey));
        history.set(addedKey, array);
    }
}

function compareState(current: Map<string, string>, previous: Map<string, string>, currentRevision: RevisionMetadata): Map<string, HistoryItem> {
    let result = new Map<string, HistoryItem>();

    let currentKeys = new Set(current.keys());
    let previousKeys = new Set(previous.keys());

    // added in current
    let addedKeys = new Set(currentKeys);
    previousKeys.forEach(k => addedKeys.delete(k));
    for (let addedKey of addedKeys) {
        result.set(addedKey, new HistoryItem(currentRevision, EditType.Created, current.get(addedKey).length));
    }

    // changed
    let changedKeys = [...current.keys()].filter(k => previous.get(k) !== current.get(k));
    for (let changedKey of changedKeys) {
        result.set(changedKey, new HistoryItem(currentRevision, EditType.Changed, (current.get(changedKey) ?? '').length - (previous.get(changedKey) ?? '').length));
    }

    // removed in current
    let removedKeys = new Set(previousKeys);
    currentKeys.forEach(k => removedKeys.delete(k));
    for (let removedKey of removedKeys) {
        result.set(removedKey, new HistoryItem(currentRevision, EditType.Deleted, -previous.get(removedKey).length));
    }

    return result;
}

function convertBaseItemState(revision: RevisionMetadata, state: Map<string, string>): Map<string, HistoryItem> {
    const result = new Map<string, HistoryItem>();
    for (let propKey of state.keys()) {
        result.set(propKey, new HistoryItem(revision, EditType.FirstRevision, state.get(propKey).length));
    }
    return result;
}

window.onload = init;
