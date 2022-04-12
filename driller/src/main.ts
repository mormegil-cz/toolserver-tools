import * as Toastify from 'toastify-js';
import * as vis from 'vis-network/standalone';

const $: (elementId: string) => HTMLElement | null = document.getElementById.bind(document);

// TODO: configurable language
const LANGUAGES = ['en', 'cs'];

const MAX_DRILL_VALUES = 10;
const WBGETENTITIES_BATCH_SIZE = 50;
const RE_SPARQL_PATH: RegExp = /!?\^?[a-z]*:(P[1-9][0-9]*|[A-Za-z]+)[*+?]?([|/]!?\^?[a-z]*:(P[1-9][0-9]*|[A-Za-z]+)[*+?]?)*/;
const WD_API_ENDPOINT = 'https://www.wikidata.org/w/api.php';
const WQS_SPARQL_API_ENDPOINT = 'https://query.wikidata.org/sparql?format=json&query=';
const QID_URI_PREFIX = 'http://www.wikidata.org/entity/';
const QID_URI_PREFIX_LENGTH = QID_URI_PREFIX.length;
const PROP_URI_PREFIX = 'http://www.wikidata.org/prop/';
const PROP_URI_PREFIX_LENGTH = PROP_URI_PREFIX.length;

class PropertyUsage {
    public label: string;

    public constructor(
        public readonly property: string,
        public readonly count: number
    ) {
    }
}

interface QueryableNode {
    availableProperties: PropertyUsage[] | null;
    computeQuery(): string;
}

abstract class GraphNode implements vis.Node {
    private static currentId: number = 0;

    private _caption: string;

    public readonly id: number;
    public label: string;

    protected constructor(
        caption: string,
        public shape: string,
        public readonly count?: number,
    ) {
        this.id = GraphNode.currentId++;
        this.caption = caption;
    }

    public get caption() {
        return this._caption;
    }

    public set caption(value: string) {
        this._caption = value;
        this.label = this.count ? (`${value}\n${this.count}`) : value;
    }

    public abstract canQuery(): this is QueryableNode;
}

class DummyNode extends GraphNode {
    public constructor(
        label: string,
    ) {
        super(label, 'ellipse');
    }

    public override canQuery(): boolean {
        return false;
    }
}

class DrillDownPropertyNode extends GraphNode {
    public constructor(
        property: string,
    ) {
        super(property, 'circle');
    }

    public override canQuery(): boolean {
        return false;
    }
}

abstract class ItemSet extends GraphNode implements QueryableNode {
    public availableProperties: PropertyUsage[] | null = null;

    protected constructor(
        property: string,
        shape: string,
        count: number,
    ) {
        super(property, shape, count);
    }

    public abstract computeQuery(): string;

    public override canQuery(): boolean {
        return true;
    }
}

class QueryItemSet extends ItemSet {
    constructor(
        label: string,
        public readonly query: string,
        count: number,
    ) {
        super(label, 'box', count);
    }

    public override computeQuery(): string {
        return this.query;
    }
}

function padNumber(num: number, digits: number): string {
    return num.toFixed(0).padStart(digits, '0');
}

function uriToQid(uri: string): string {
    return uri.substring(QID_URI_PREFIX_LENGTH);
}

function uriToProp(uri: string): string {
    return uri.substring(PROP_URI_PREFIX_LENGTH);
}

function uriToEntityId(uri: string): string {
    if (uri.startsWith(QID_URI_PREFIX)) {
        return uriToQid(uri);
    } else if (uri.startsWith(PROP_URI_PREFIX)) {
        return uriToProp(uri);
    } else {
        throw new Error('Unsupported concept URI ' + uri);
    }
}

function uriToEntityIdIfAvailable(uri: string): string {
    if (uri.startsWith(QID_URI_PREFIX)) {
        return uriToQid(uri);
    } else if (uri.startsWith(PROP_URI_PREFIX)) {
        return uriToProp(uri);
    } else {
        return uri;
    }
}

let labelsForEntities: Record<string, string> = {};
function getLabelForEntityId(entityId: string): string | null {
    return labelsForEntities[entityId] ?? null;
}

function getLocalizedLabel(labels: Record<string, any>, languages: string[]): string | null {
    for (const language of languages) {
        const value = labels[language];
        if (value && value.value) {
            return value.value;
        }
    }
    return null;
}

function formatValue(type: string, value: string): string {
    switch (type) {
        case 'uri':
            const entityId = uriToEntityIdIfAvailable(value);
            return entityId ? (getLabelForEntityId(entityId) ?? entityId) : value;

        case 'http://www.w3.org/2001/XMLSchema#dateTime':
            const date = new Date(value);
            return `${date.getUTCFullYear()}-${padNumber(date.getUTCMonth() + 1, 2)}-${padNumber(date.getUTCDate(), 2)}`;

        default:
            return value;
    }
}

function expressValueInSparql(type: string, value: string): string {
    switch (type) {
        case 'uri':
            return value.startsWith(QID_URI_PREFIX) ? 'wd:' + uriToQid(value) : `<${value}>`;

        case 'http://www.w3.org/2001/XMLSchema#dateTime':
            return `"${value}"^^xsd:dateTime`;

        default:
            const jsoned = JSON.stringify(value);
            return `'${jsoned.substring(1, jsoned.length - 1).replace(/'/g, "\\'")}'`;
    }
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

function setVisible($element: HTMLElement, visible: boolean, type: 'inline' | 'block') {
    $element.style.display = visible ? type : 'none';
}

const nodes = new vis.DataSet<GraphNode>([]);
const edges = new vis.DataSet<vis.Edge>([]);

function init() {
    const $selectionLabel = $('selectionLabel');
    const $selectionToolbox = $('selectionToolbox');
    const $editQuerySparql = $('editQuerySparql') as HTMLTextAreaElement;
    const $boxDrillPropProperty = $('boxDrillPropProperty') as HTMLSelectElement;
    // any because of old typings, not yet released: https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1258
    const $dlgQuery: any = $('dlgQuery') as HTMLDialogElement;
    const $dlgDrillProp: any = $('dlgDrillProp') as HTMLDialogElement;
    const $btnUnion = $('btnUnion') as HTMLButtonElement;
    const $btnIntersect = $('btnIntersect') as HTMLButtonElement;
    const $btnDeleteNode = $('btnDeleteNode') as HTMLButtonElement;
    const $btnWqs = $('btnWqs') as HTMLButtonElement;
    const $btnLoadProps = $('btnLoadProps') as HTMLButtonElement;
    const $btnDrillProp = $('btnDrillProp') as HTMLButtonElement;
    const $btnDrillCustomProp = $('btnDrillCustomProp') as HTMLButtonElement;

    $('selectionLabel').addEventListener('click', editNodeLabel);
    $btnUnion.addEventListener('click', addUnionNode);
    $btnIntersect.addEventListener('click', addIntersectNode);
    $('btnAddQuery').addEventListener('click', showInitialQueryDialog);
    $('btnDeleteNode').addEventListener('click', deleteNode);
    $btnWqs.addEventListener('click', openNodeInWqs);
    $btnLoadProps.addEventListener('click', loadItemSetProps);
    $btnDrillProp.addEventListener('click', showDrillPropDialog);
    $btnDrillCustomProp.addEventListener('click', drillCustomProp);

    $dlgQuery.addEventListener('close', addQueryNode);
    $dlgDrillProp.addEventListener('close', drillProp);

    const options: vis.Options = {
        interaction: {
            multiselect: true,
        },
        nodes: {
            scaling: {
                min: 1,
                max: 10,
                label: {
                    enabled: true,
                    min: 10,
                    max: 50,
                }
            }
        }
    };
    const data: vis.Data = {
        nodes: nodes,
        edges: edges
    };
    const network = new vis.Network($('display'), data, options);
    network.on('selectNode', updateSelection);
    network.on('deselectNode', updateSelection);

    $('btnZoomFit').addEventListener('click', () => network.fit());
    $('btnZoomPlus').addEventListener('click', () => changeZoom(1.4142));
    $('btnZoomMinus').addEventListener('click', () => changeZoom(0.7071));

    // addNode(new QueryItemSet('Czech Monuments', '?item wdt:P4075 []'));

    function addNode(node: GraphNode) {
        nodes.add(node);
        network.focus(node.id);
        network.fit();
    }

    function addEdge(from: GraphNode, to: GraphNode) {
        edges.add({ id: edges.length, from: from.id, to: to.id, arrows: 'to' });
    }

    let nodeBeingDeleted: GraphNode | null = null;
    let nodeDeletionTimeout: number | null = null;

    function deleteNode() {
        const node = getSelectedNode();
        if (!node) return;

        if (nodeDeletionTimeout) {
            clearTimeout(nodeDeletionTimeout);
            nodeDeletionTimeout = null;
        }

        if (nodeBeingDeleted === node) {
            nodes.remove(node.id);
            $btnDeleteNode.innerText = 'Del!';
            updateSelection();
        } else {
            nodeBeingDeleted = node;
            $btnDeleteNode.innerText = 'Sure?';
            nodeDeletionTimeout = window.setTimeout(() => {
                nodeBeingDeleted = null;
                $btnDeleteNode.innerText = 'Del!';
            }, 2000);
        }
    }

    function getAllSelectedQueryableNodes(): (GraphNode & QueryableNode)[] {
        return network
            .getSelectedNodes()
            .map(id => nodes.get(id))
            .filter((node): node is GraphNode & QueryableNode => node.canQuery());
    }

    function computeCompoundQuery(nodes: (GraphNode & QueryableNode)[], operator: string): string {
        const allQueries: string[] = [];
        for (const node of nodes) {
            allQueries.push(node.computeQuery());
        }
        return allQueries.join(operator);
    }

    function addEdgesToCompoundQueryNode(fromNodes: GraphNode[], toNode: GraphNode) {
        if (!toNode) return;

        for (const node of fromNodes) {
            addEdge(node, toNode);
        }
    }

    function addUnionNode() {
        const selectedNodes = getAllSelectedQueryableNodes();
        if (selectedNodes.length <= 1) return;

        addQueryItemSetNode('union', '{ ' + computeCompoundQuery(selectedNodes, ' } UNION { ') + ' }')
            .then(node => addEdgesToCompoundQueryNode(selectedNodes, node));
    }

    function addIntersectNode() {
        const selectedNodes = getAllSelectedQueryableNodes();
        if (selectedNodes.length <= 1) return;

        addQueryItemSetNode('intersect', '{ ' + computeCompoundQuery(selectedNodes, ' } { ') + ' }')
            .then(node => addEdgesToCompoundQueryNode(selectedNodes, node));
    }

    function showInitialQueryDialog() {
        $editQuerySparql.value = 'VALUES ?item { wd:Q42 }';
        $dlgQuery.showModal();
    }

    function showDrillPropDialog() {
        const node = getSelectedNode();
        if (!node?.canQuery()) return;

        const props = node.availableProperties;
        $boxDrillPropProperty.innerHTML = '';
        for (let i = 0; i < props.length; ++i) {
            let prop = props[i];
            const option = document.createElement('option') as HTMLOptionElement;
            option.value = prop.property;
            option.text = `${prop.property} ${prop.label} (${prop.count})`;
            $boxDrillPropProperty.add(option);
        }

        $dlgDrillProp.showModal();
    }

    function addQueryItemSetNode(caption: string, query: string): Promise<QueryItemSet | null> {
        return runQuery(`SELECT (COUNT(?item) AS ?driller_count) WHERE { ${query} }`)
            .then(queryResults => {
                let resultCount = queryResults.length;
                if (resultCount != 1) {
                    toastError('Unexpected result from WQS query');
                    return;
                }

                const itemCount = +queryResults[0].driller_count.value;
                if (itemCount === 0) {
                    toastWarning("No such item");
                    return null;
                }
                const node = new QueryItemSet(caption, query, itemCount);
                const nodeOptions = node as vis.NodeOptions;
                // nodeOptions.physics = false;
                nodeOptions.mass = nodeOptions.value = 1 + Math.log10(itemCount);
                addNode(node);
                network.selectNodes([node.id]);
                updateSelection();

                return node;
            })
            .catch(_error => {
                toastError('WQS request failed');
                return null;
            });
    }

    function addQueryNode() {
        if (!$dlgQuery.returnValue) return;

        addQueryItemSetNode(`Query ${nodes.length + 1}`, $editQuerySparql.value);
    }

    function loadItemSetProps() {
        const node = getSelectedNode();
        if (!node?.canQuery()) return;

        let availableProperties: PropertyUsage[] = [];

        runQuery(
            // TODO: p: or wdt:?
            `SELECT ?driller_prop ?driller_count WHERE { { SELECT ?driller_prop (COUNT(?item) AS ?driller_count) WHERE { { ${node.computeQuery()} } ?item ?driller_prop []. } GROUP BY ?driller_prop\n}FILTER(STRSTARTS(STR(?driller_prop), "http://www.wikidata.org/prop/P")) } ORDER BY DESC (?driller_count)`
        )
            .then(queryResults => {
                let resultCount = queryResults.length;
                if (!resultCount) {
                    // strange indeed!
                    toastWarning('No properties found');
                    return Promise.resolve();
                }

                let propertiesToResolve = [];
                for (let i = 0; i < resultCount; ++i) {
                    const propertyUri: string = queryResults[i].driller_prop.value;
                    const count: number = +queryResults[i].driller_count.value;

                    const propId = uriToProp(propertyUri);
                    availableProperties.push(new PropertyUsage(propId, count));
                    if (!labelsForEntities[propId]) {
                        propertiesToResolve.push(PROP_URI_PREFIX + propId);
                    }
                }

                return propertiesToResolve.length ? resolveLabels(propertiesToResolve) : Promise.resolve();
            })
            .then(() => {
                if (!availableProperties.length) return;

                const resultCount = availableProperties.length;
                for (let i = 0; i < resultCount; ++i) {
                    const prop = availableProperties[i];
                    prop.label = getLabelForEntityId(prop.property);
                }

                node.availableProperties = availableProperties;
                updateSelection();
                toastInfo(`${resultCount} properties loaded`);
            })
            .catch(_error => {
                toastError('WQS request failed');
            });
    }

    function drillProp() {
        if (!$dlgDrillProp.returnValue) return;

        const node = getSelectedNode();
        if (!node?.canQuery()) return;
        if (!$boxDrillPropProperty.selectedOptions.length) return;

        const selectedOption = $boxDrillPropProperty.selectedOptions[0];
        const prop = selectedOption.value;

        // TODO: wdt: or p:/ps:?
        runDrillProp(node, `p:${prop}/ps:${prop}`, getLabelForEntityId(prop));
    }

    function drillCustomProp() {
        const node = getSelectedNode();
        if (!node?.canQuery()) return;

        const prop = prompt('Property: ', 'wdt:P31');
        if (!prop) return;
        if (!RE_SPARQL_PATH.test(prop)) {
            toastWarning('Invalid property path syntax');
            return;
        }

        runDrillProp(node, prop, prop.replace(/(wdt|wikibase):/g, ''));
    }

    function runDrillProp(node: GraphNode & QueryableNode, prop: string, caption: string) {
        runQuery(
            `SELECT ?driller_value (COUNT(?item) AS ?driller_count) WHERE { { ${node.computeQuery()} } ?item ${prop} ?driller_value } GROUP BY ?driller_value\nORDER BY DESC(?driller_count)\nLIMIT ${MAX_DRILL_VALUES + 1}`)
            .then(queryResults => {
                let resultCount = queryResults.length;
                if (!resultCount) {
                    toastWarning('No such claim');
                    return;
                }

                if (resultCount > MAX_DRILL_VALUES) {
                    toastWarning(`Too many values, showing ${MAX_DRILL_VALUES} most common`);
                    resultCount = MAX_DRILL_VALUES;
                }

                const valueType: string = queryResults[0].driller_value.type;

                let urisToResolve: string[] = [];
                if (valueType === 'uri') {
                    for (let i = 0; i < resultCount; ++i) {
                        urisToResolve.push(queryResults[i].driller_value.value);
                    }

                    return resolveLabels(urisToResolve)
                        .then(_resolvedLabels => ({ resultCount: resultCount, queryResults: queryResults }));
                } else {
                    return { resultCount: resultCount, queryResults: queryResults };
                }
            })
            .then(({ resultCount, queryResults }: { resultCount: number, queryResults: any[] }) => {
                const drillPropertyNode = new DrillDownPropertyNode(caption);
                addNode(drillPropertyNode);
                addEdge(node, drillPropertyNode);

                const valueType: string = queryResults[0].driller_value.type;

                const dataType: string = queryResults[0].driller_value.datatype;
                const type: string = valueType === 'literal' ? dataType : valueType;

                for (let i = 0; i < resultCount; ++i) {
                    const value: string = queryResults[i].driller_value.value;
                    const count: number = +queryResults[i].driller_count.value;

                    const valueLabel = formatValue(type, value);
                    const valueSparql = expressValueInSparql(type, value);

                    const valueNode = new QueryItemSet(valueLabel, `{ { ${node.computeQuery()} } ?item ${prop} ${valueSparql} }`, count);
                    const nodeOptions = valueNode as vis.NodeOptions;
                    nodeOptions.mass = nodeOptions.value = 1 + Math.log10(count);

                    addNode(valueNode);
                    addEdge(drillPropertyNode, valueNode);
                }

                network.focus(drillPropertyNode.id);
                network.fit();
                network.selectNodes([drillPropertyNode.id]);
                updateSelection();
            })
            .catch(_error => {
                toastError('WQS request failed');
            });
    }

    function changeZoom(frac: number) {
        // bad typing, see https://visjs.github.io/vis-network/docs/network/#methodViewport
        network.moveTo(
            <any>{
                scale: network.getScale() * frac,
                position: network.getViewPosition(),
            }
        );
    }

    function getSelectedNode(): (GraphNode | null) {
        const selectedNodeIds = network.getSelectedNodes();
        return selectedNodeIds.length === 1 ? nodes.get(selectedNodeIds[0]) : null;
    }

    function editNodeLabel() {
        const selectedNode = getSelectedNode();
        if (!selectedNode) return;
        const editedCaption = prompt('Node caption:', selectedNode.caption);
        if (editedCaption) {
            nodes.remove(selectedNode);
            selectedNode.caption = editedCaption;
            $selectionLabel.innerText = selectedNode.label;
            nodes.add(selectedNode);
        }
    }

    function updateSelection() {
        const selectedNodeIds = network.getSelectedNodes()
        const selectedNode = selectedNodeIds.length === 1 ? nodes.get(selectedNodeIds[0]) : null;

        const multiselectAllCanQuery = selectedNodeIds.length > 1 && selectedNodeIds.map(id => nodes.get(id)).filter(node => !node || !node.canQuery()).length === 0;

        let canQuery: boolean;
        let loadedProperties: boolean;
        if (selectedNode) {
            $selectionLabel.innerText = selectedNode.label;
            $selectionToolbox.style.visibility = 'visible';
            canQuery = selectedNode.canQuery();
            loadedProperties = selectedNode.canQuery() && !!selectedNode.availableProperties;
        } else {
            $selectionLabel.innerText = '';
            $selectionToolbox.style.visibility = 'hidden';
            canQuery = false;
            loadedProperties = false;
        }

        setVisible($btnUnion, multiselectAllCanQuery, 'inline');
        setVisible($btnIntersect, multiselectAllCanQuery, 'inline');

        setVisible($btnWqs, canQuery, 'inline');
        setVisible($btnLoadProps, canQuery && !loadedProperties, 'inline');
        setVisible($btnDrillProp, canQuery && loadedProperties, 'inline');
        setVisible($btnDrillCustomProp, canQuery, 'inline');
    }

    function openNodeInWqs() {
        const selectedNode = getSelectedNode();
        if (!selectedNode || !selectedNode.canQuery()) return;

        window.open('https://query.wikidata.org/#' + encodeURIComponent(`SELECT ?item ?itemLabel WHERE {\n\t${selectedNode.computeQuery().replace(/\\n/g, '\n\t')}\n\tSERVICE wikibase:label { bd:serviceParam wikibase:language "${LANGUAGES.join(',')}". }\n}`))
    }

    function resolveLabels(uris: string[]): Promise<void> {
        spinnerOn();

        const entityIds = uris.map(uriToEntityIdIfAvailable).filter(id => id && !getLabelForEntityId(id));

        const entityCount = entityIds.length;
        let result = Promise.resolve();
        for (let batchFrom = 0; batchFrom < entityCount; batchFrom += WBGETENTITIES_BATCH_SIZE) {
            let batch = entityIds.slice(batchFrom, Math.min(batchFrom + WBGETENTITIES_BATCH_SIZE, entityCount));
            result = result.then(() =>
                fetch(`${WD_API_ENDPOINT}?action=wbgetentities&format=json&origin=*&ids=${batch.join("%7C")}&props=labels&languages=${LANGUAGES.join('%7C')}`)
                    .then(response => {
                        if (response.status !== 200) {
                            return response.text()
                                .then(errText => {
                                    console.error('Failed executing API request', batch, response, errText);
                                    throw errText;
                                });
                        }

                        return response.json();
                    })
                    .then((data: any) => {
                        const entities = data.entities;
                        for (const entityId in entities) {
                            const entity = entities[entityId];
                            labelsForEntities[entityId] = getLocalizedLabel(entity.labels, LANGUAGES) ?? entityId;
                        }
                    })
            );
        }
        return result.finally(spinnerOff);
    }

    function runQuery(sparql: string): Promise<any[]> {
        spinnerOn();

        return fetch(WQS_SPARQL_API_ENDPOINT + encodeURIComponent(sparql))
            .then(response => {
                if (response.status !== 200) {
                    return response.text()
                        .then(errText => {
                            console.error('Failed executing SPARQL query', sparql, response, errText);
                            throw errText;
                        });
                }

                return response.json();
            })
            .then(result => result.results.bindings)
            .finally(spinnerOff);
    }

    let spinCount = 1;
    const $spinner = $('spinner');

    function spinnerOn() {
        ++spinCount;
        if (spinCount == 1) {
            $spinner.style.display = 'block';
        }
    }

    function spinnerOff() {
        --spinCount;
        if (spinCount == 0) {
            $spinner.style.display = 'none';
        }
    }

    updateSelection();
    spinnerOff();
}

window.onload = init;
