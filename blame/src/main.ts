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

const BATCH_SIZE: number | 'max' = 'max';

const itemPartValues = <ItemPart[]>Object.values(ItemPart);

const orderingFunctions: Record<string, ((aKey: string, a: HistoryItem[], bKey: string, b: HistoryItem[]) => number)> = {};
orderingFunctions[Ordering.alpha] = compareHistoryItemsAlpha;
orderingFunctions[Ordering.chrono] = compareHistoryItemsChrono;

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

interface MWAPIQueryResultRevision {
    revid: number;
    parentid: number;
    minor: boolean;
    anon?: boolean;
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
}

interface MWAPIQueryResponse {
    batchcomplete?: boolean;
    continue?: {
        rvcontinue: string;
        continue: string;
    };
    query: {
        pages: {
            missing: boolean;
            pageid: number;
            ns: number;
            title: string;
            revisions: MWAPIQueryResultRevision[];
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
    const requestedEntity = window.prompt('Entity to load?', 'Q42');
    if (requestedEntity === null) {
        return;
    }
    // TODO: Support wikibase-property and wikibase-lexeme
    /*
    if (!/^[LPQlpq][1-9][0-9]*$/.test(requestedEntity)) {
        reportError('Invalid/unsupported entity identifier');
        return;
    }
    let id: string;
    switch (requestedEntity[0].toUpperCase()) {
        case 'P':
            id = 'Property:' + requestedEntity;
            break;

        case 'L':
            id = 'Lexeme:' + requestedEntity;
            break;

        case 'Q':
            id = requestedEntity;
            break;
    }*/
    if (!/^[Qq][1-9][0-9]*$/.test(requestedEntity)) {
        reportError('Invalid/unsupported entity identifier');
        return;
    }

    const id = requestedEntity;

    showSpinner();

    processRevisions(
        queryAndParseRevisions(id)
    )
        .then(parsedData => {
            data = parsedData;
            renderScreen();
            hideSpinner();
        })
        .catch(error => {
            console.error(error);
            reportError("Error loading/parsing item");
            hideSpinner();
        });
}

async function* queryAndParseRevisions(id: string): AsyncGenerator<ItemState, void, void> {
    for await (let queryResult of executeApiQueries(id)) {
        for (let itemState of parseApiResponse(queryResult)) {
            yield itemState;
        }
    }
}

async function processRevisions(revisions: AsyncGenerator<ItemState>): Promise<BlameData> {
    let parts = new Map<ItemPart, Map<string, HistoryItem[]>>();
    let currentState: ItemState | undefined = undefined;

    for await (let revision of revisions) {
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

async function* executeApiQueries(qid: string): AsyncGenerator<MWAPIQueryResultRevision[], void, void> {
    let continueToken: string | null = null;
    while (true) {
        const response = await executeSingleApiCall(qid, BATCH_SIZE, continueToken);

        if (!response?.query?.pages || response.query.pages.length != 1) {
            reportError('Error fetching revisions');
            console.debug(response);
            return;
        }

        const pageData = response.query.pages[0];
        if (pageData.missing || !pageData.pageid) {
            reportError('Entity not found');
            console.debug(response);
            return;
        }

        const revisions = pageData.revisions;
        yield revisions;
        if (response.batchcomplete) {
            break;
        }

        continueToken = response.continue.rvcontinue;
    }
}

async function executeSingleApiCall(qid: string, revlimit: number | 'max', continueToken: string | null): Promise<MWAPIQueryResponse> {
    let url = `https://www.wikidata.org/w/api.php?action=query&format=json&origin=*&prop=revisions&formatversion=2&rvprop=ids%7Ctimestamp%7Cuser%7Ccontent%7Ccontentmodel%7Ccomment%7Cparsedcomment%7Cflags&rvslots=main&rvlimit=${revlimit}&titles=${qid}`;
    if (continueToken) {
        url += '&rvcontinue=' + continueToken;
    }
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

function* parseApiResponse(revisions: MWAPIQueryResultRevision[]): Iterable<ItemState> {
    for (let revisionData of revisions) {
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
    renderSection('Labels', data.parts.get(ItemPart.Labels));
    renderSection('Descriptions', data.parts.get(ItemPart.Descriptions));
    renderSection('Aliases', data.parts.get(ItemPart.Aliases));
    renderSection('Claims', data.parts.get(ItemPart.Claims));
    renderSection('Sitelinks', data.parts.get(ItemPart.Sitelinks));
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

function renderSection(sectionId: string, entries: Map<string, HistoryItem[]>) {
    const containerId = 'sectionContent' + sectionId;
    const $container = document.getElementById(containerId);
    $container.innerHTML = '';
    const $header = document.getElementById('sectionHeader' + sectionId);

    // Sorting
    const compareFunction = orderingFunctions[ordering];
    let entriesKeys = [...entries.keys()];
    entriesKeys.sort((k1, k2) => compareFunction(k1, entries.get(k1), k2, entries.get(k2)));

    let activeEntries = 0;
    let deletedEntries = 0;
    for (let key of entriesKeys) {
        const data = entries.get(key);
        const id = `${containerId}-${key}`;
        const idHeading = `${id}-heading`;
        const idContent = `${id}-content`;
        const timeInfo = determineTimeInfo(data);

        if (data[0].editType === EditType.Deleted) {
            ++deletedEntries;
        } else {
            ++activeEntries;
        }

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

    $header.innerText = makeSectionSummary(activeEntries, deletedEntries);
}

function makeSectionSummary(activeEntries: number, deletedEntries: number): string {
    if (activeEntries > 0 && deletedEntries > 0) {
        return `${activeEntries} active, ${deletedEntries} deleted`;
    } else if (activeEntries > 0) {
        return `${activeEntries} active`;
    } else if (deletedEntries > 0) {
        return `${deletedEntries} deleted`;
    } else {
        return `No data`;
    }
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

function compareHistoryItemsAlpha(aKey: string, _a: HistoryItem[], bKey: string, _b: HistoryItem[]): number {
    return aKey.localeCompare(bKey, undefined, { numeric: true });
}

function compareHistoryItemsChrono(_aKey: string, a: HistoryItem[], _bKey: string, b: HistoryItem[]): number {
    return -(getLatestTimestamp(a).localeCompare(getLatestTimestamp(b)));
}

function getLatestTimestamp(arr: HistoryItem[]): string {
    return arr.length === 0 ? '' : arr[0].revision.timestamp;
}

function determineTimeInfo(items: HistoryItem[]): string {
    switch (items.length) {
        case 0:
            // ?? should not happen
            return '?';

        case 1:
            const onlyRevision = items[0];
            switch (onlyRevision.editType) {
                case EditType.Created:
                    return `since ${onlyRevision.revision.timestamp}`;

                case EditType.Deleted:
                    // ? should not happen
                    return `until ${onlyRevision.revision.timestamp}`;

                case EditType.Changed:
                default:
                    // ? should not happen
                    return `existing at ${onlyRevision.revision.timestamp}`;
            }

        default:
            const latestRevision = items[0];
            const oldestRevision = items.at(-1);
            if (latestRevision.editType === EditType.Deleted) {
                return `${items.length} versions; ${oldestRevision.revision.timestamp} – ${latestRevision.revision.timestamp}`;
            } else {
                switch (oldestRevision.editType) {
                    case EditType.Created:
                        return `${items.length} versions; since ${oldestRevision.revision.timestamp}, edited ${latestRevision.revision.timestamp}`;

                    case EditType.Deleted:
                    case EditType.Changed:
                    default:
                        // ?? should not happen!
                        return `${items.length} versions; existing at ${oldestRevision.revision.timestamp}, edited ${latestRevision.revision.timestamp}`;
                }
            }
    }
}

function parseRevisionData(metadata: RevisionMetadata, revision: MWApiItemContent): ItemState {
    let parts = new Map<ItemPart, Map<string, string>>();

    for (let part of itemPartValues) {
        let parsedPart = new Map<string, string>();
        let revisionPart = revision[part];
        if (typeof revisionPart === 'object') {
            for (let entryKey of Object.keys(revisionPart)) {
                let entryData = revisionPart[entryKey];
                let entryStr = JSON.stringify(entryData);
                parsedPart.set(entryKey, entryStr);
            }
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
    let changedKeys = [...current.keys()].filter(k => previous.has(k) && (previous.get(k) !== current.get(k)));
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
        result.set(propKey, new HistoryItem(revision, EditType.Created, state.get(propKey).length));
    }
    return result;
}

window.onload = init;
