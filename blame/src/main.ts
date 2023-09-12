import './scss/styles.scss'
import * as bootstrap from 'bootstrap'

enum Ordering {
    alpha = "alpha",
    newest = "newest",
    oldest = "oldest",
};

let ordering = Ordering.alpha;
let data: BlameData | null = null;
let dataEntityId: string | null = null;
let dataEntityRevisionCount: number | null = null;
let stopRequested = false;

enum ItemPart {
    Labels = "labels",
    Descriptions = "descriptions",
    Aliases = "aliases",
    Claims = "claims",
    Sitelinks = "sitelinks",

    // Lexeme-specific
    Lemmas = "lemmas",
    Forms = "forms",
    Senses = "senses",
}
const itemPartValues = <ItemPart[]>Object.values(ItemPart);

const BATCH_SIZE: number | 'max' = 'max';
const SUPPORTED_MODELS = new Set<string>(['wikibase-item', 'wikibase-property', 'wikibase-lexeme']);

const orderingFunctions: Record<string, ((aKey: string, a: HistoryItem[], bKey: string, b: HistoryItem[]) => number)> = {};
orderingFunctions[Ordering.alpha] = compareHistoryItemsAlpha;
orderingFunctions[Ordering.newest] = compareHistoryItemsNewest;
orderingFunctions[Ordering.oldest] = compareHistoryItemsOldest;

class BlameData {
    constructor(public parts: Map<ItemPart, Map<string, HistoryItem[]>>, public revisionCount: number) {
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

interface MWAPIPageHistoryCountResponse {
    count: number;
    limit: boolean;
}

interface MWAPIQueryResultRevision {
    revid?: number;
    parentid?: number;
    minor?: boolean;
    anon?: boolean;
    user?: string;
    timestamp: string;
    slots?: {
        main: {
            contentmodel: string;
            contentformat: string;
            content: string;
        }
    };
    comment?: string;
    parsedcomment?: string;
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

    document.getElementById('btnCancel').addEventListener('click', handleCancelClick);

    renderScreen();

    loadFromUrl();
}

function loadFromUrl() {
    const hash = window.location.hash;
    if (/^#[LPQ][1-9][0-9]*$/.test(hash)) {
        loadEntity(hash.substring(1));
    }
}

function reportToast(error: string, type: 'primary'|'secondary'|'success'|'danger'|'warning'|'info'|'light'|'dark') {
    console.log(error);
    const $toast = $E('div', { class: `alert alert-${type} alert-dismissible fade show`, role: 'alert' }, [
        error,
        $E('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'alert', 'aria-label': 'Close' }, [])
    ]);
    document.getElementById('alertContainer').appendChild($toast);
}

function reportError(error: string) {
    reportToast(error, 'danger');
}

function reportWarning(error: string) {
    reportToast(error, 'warning');
}

function showProgressDialog() {
    stopRequested = false;
    setProgress(null, null, null);
    document.getElementById('modalBackground').style.display = 'block';
    document.getElementById('dlgLoading').style.display = 'block';
}

function setProgress(currentRev: number | null, revCount: number | null, currTimestamp: string | null) {
    const $progress = <HTMLProgressElement>document.getElementById('progress');
    const $labelProgress = <HTMLDivElement>document.getElementById('labelProgress');
    if (revCount === null) {
        $progress.value = null;
        $progress.max = null;
        $labelProgress.innerText = '';
        return;
    }

    $progress.value = currentRev;
    $progress.max = revCount;
    $labelProgress.innerText = currTimestamp ? `${currentRev}/${revCount} (${currTimestamp})` : `${currentRev}/${revCount}`;
}

function hideProgressDialog() {
    document.getElementById('dlgLoading').style.display = 'none';
    document.getElementById('modalBackground').style.display = 'none';
}

function loadEntity(requestedEntity: string) {
    const lastSeparator = Math.max(requestedEntity.lastIndexOf('/'), requestedEntity.lastIndexOf(':'));
    const requestedId = lastSeparator >= 0 ? requestedEntity.substring(lastSeparator + 1) : requestedEntity;
    let id: string;
    switch (requestedId[0].toUpperCase()) {
        case 'P':
            id = 'Property:' + requestedId.toUpperCase();
            break;

        case 'L':
            id = 'Lexeme:' + requestedId.toUpperCase();
            break;

        case 'Q':
            id = requestedId.toUpperCase();
            break;
    }

    showProgressDialog();

    getEntityRevisionCount(id)
        .then(revisionCount => {
            dataEntityRevisionCount = revisionCount;
            setProgress(0, dataEntityRevisionCount, null);
            return processRevisions(
                queryAndParseRevisions(id)
            )
        })
        .then(parsedData => {
            if (parsedData.revisionCount === 0) {
                // failed, nothing to display
                hideProgressDialog();
                return;
            }
            data = parsedData;
            dataEntityId = id;
            renderScreen();
            hideProgressDialog();
            if (stopRequested) {
                reportWarning('Loading interrupted. Results will be incomplete/wrong.');
            }
        })
        .catch(error => {
            console.error(error);
            reportError("Error loading/parsing item");
            hideProgressDialog();
        });
}

function handleLoadClick() {
    const requestedEntity = window.prompt('Entity to load?', 'Q42');
    if (requestedEntity === null) {
        return;
    }
    if (!/^(https?:\/\/(www\.)?wikidata\.org\/wiki\/)?((Lexeme:)?L|(Property:)?P|Q)[1-9][0-9]*$/i.test(requestedEntity)) {
        reportError('Invalid/unsupported entity identifier');
        return;
    }
    loadEntity(requestedEntity);
}

function handleCancelClick() {
    stopRequested = true;
    const btnCancel = <HTMLButtonElement>document.getElementById('btnCancel');
    btnCancel.disabled = true;
    return false;
}

async function* queryAndParseRevisions(id: string): AsyncGenerator<ItemState, void, void> {
    for await (let queryResult of executeApiQueries(id)) {
        for (let itemState of parseApiResponse(queryResult)) {
            yield itemState;
        }
    }
}

async function getEntityRevisionCount(id: string): Promise<number> {
    let url = `https://www.wikidata.org/w/rest.php/v1/page/${id}/history/counts/edits`;
    let response = await fetch(url);
    if (response.status !== 200) {
        return response.text()
            .then(errText => {
                console.error('Failed executing API request', response, errText);
                throw new Error(errText);
            });
    }
    const pageHistoryCount = <MWAPIPageHistoryCountResponse>(await response.json());
    return pageHistoryCount.count;
}

async function processRevisions(revisions: AsyncGenerator<ItemState>): Promise<BlameData> {
    let parts = new Map<ItemPart, Map<string, HistoryItem[]>>();
    let currentState: ItemState | undefined = undefined;

    let revisionCount = 0;
    for await (let revision of revisions) {
        ++revisionCount;
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
        setProgress(revisionCount, dataEntityRevisionCount, revision.metadata.timestamp);
    }

    if (currentState !== undefined) {
        for (let part of itemPartValues) {
            appendHistory(
                getOrInsert(parts, part, Map<string, HistoryItem[]>),
                convertBaseItemState(currentState.metadata, currentState.parts.get(part))
            );
        }
    }

    return new BlameData(parts, revisionCount);
}

async function* executeApiQueries(qid: string): AsyncGenerator<MWAPIQueryResultRevision[], void, void> {
    let continueToken: string | null = null;
    while (true) {
        const response = await executeSingleRevisionFetchCall(qid, BATCH_SIZE, continueToken);

        if (!response?.query?.pages || response.query.pages.length != 1) {
            reportError('Error fetching revisions');
            console.debug(response);
            return;
        }

        const pageData = response.query.pages[0];
        if (pageData.missing || !pageData.pageid) {
            reportError('Requested entity not found');
            console.debug(response);
            return;
        }

        const revisions = pageData.revisions;
        yield revisions;
        if (response.batchcomplete || stopRequested) {
            break;
        }

        continueToken = response.continue.rvcontinue;
    }
}

async function executeMWApiCall(url: string): Promise<MWAPIQueryResponse> {
    const response = await fetch(url);
    if (response.status !== 200) {
        const errText = await response.text();
        console.error('Failed executing API request', response, errText);
        throw new Error(errText);
    }
    return <MWAPIQueryResponse>(await response.json());
}

function executeSingleRevisionFetchCall(qid: string, revlimit: number | 'max', continueToken: string | null): Promise<MWAPIQueryResponse> {
    let url = `https://www.wikidata.org/w/api.php?action=query&format=json&origin=*&prop=revisions&formatversion=2&rvprop=ids%7Ctimestamp%7Cuser%7Ccontent%7Ccontentmodel%7Ccomment%7Cparsedcomment%7Cflags&rvslots=main&rvlimit=${revlimit}&titles=${qid}`;
    if (continueToken) {
        url += '&rvcontinue=' + continueToken;
    }
    return executeMWApiCall(url);
}

function* parseApiResponse(revisions: MWAPIQueryResultRevision[]): Iterable<ItemState> {
    for (let revisionData of revisions) {
        const mainSlot = revisionData.slots.main;
        if (mainSlot.contentformat !== 'application/json' || !SUPPORTED_MODELS.has(mainSlot.contentmodel)) {
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
        document.getElementById('header-info').innerHTML = '';
        document.getElementById('emptyScreen').style.display = 'block';
    } else {
        document.getElementById('emptyScreen').style.display = 'none';
        $mainContainer.style.display = 'none';
        renderData();
        $mainContainer.style.display = 'block';
    }
}

function renderData() {
    for (let part of itemPartValues) {
        const sectionId = part[0].toUpperCase() + part.substring(1);
        const partData = data.parts.get(part);
        const partVisible = !!partData.size;
        setSectionVisibility(sectionId, partVisible);
        if (partVisible) renderSection(sectionId, partData);
    }
    document.getElementById('header-info').innerText = `${dataEntityId} (${data.revisionCount} revision${data.revisionCount === 1 ? '' : 's'})`;
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

function setSectionVisibility(sectionId: string, visible: boolean) {
    const containerId = 'sectionContent' + sectionId;
    let $container = document.getElementById(containerId);
    while ($container && !$container.classList.contains('accordion-item')) $container = $container.parentElement;
    $container.style.display = visible ? 'block' : 'none';
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
        const entryDeleted = data[0].editType === EditType.Deleted;

        if (entryDeleted) {
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
                            $E('span', null, [
                                entryDeleted ? $E('s', null, [key]) : key,
                                ` (${timeInfo})`
                            ])
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
        // should not happen
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

function compareHistoryItemsNewest(aKey: string, a: HistoryItem[], bKey: string, b: HistoryItem[]): number {
    const aLen = a.length;
    const bLen = b.length;
    const minLen = Math.min(aLen, bLen);
    for (let i = 0; i < minLen; ++i) {
        let aTs = a[i].revision.timestamp;
        let bTs = b[i].revision.timestamp;
        const cmp = aTs.localeCompare(bTs);
        if (cmp !== 0) return -cmp;
    }
    const lenDiff = bLen - aLen;
    return lenDiff === 0 ? aKey.localeCompare(bKey, undefined, { numeric: true }) : lenDiff;
}

function compareHistoryItemsOldest(aKey: string, a: HistoryItem[], bKey: string, b: HistoryItem[]): number {
    const aLen = a.length;
    const bLen = b.length;
    const minLen = Math.min(aLen, bLen);
    for (let i = 1; i <= minLen; ++i) {
        let aTs = a[aLen - i].revision.timestamp;
        let bTs = b[bLen - i].revision.timestamp;
        const cmp = aTs.localeCompare(bTs);
        if (cmp !== 0) return cmp;
    }
    const lenDiff = aLen - bLen;
    return lenDiff === 0 ? aKey.localeCompare(bKey, undefined, { numeric: true }) : lenDiff;
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
