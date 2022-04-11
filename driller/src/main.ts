import * as Toastify from 'toastify-js';
import * as vis from 'vis-network/standalone';

const $: (elementId: string) => HTMLElement | null = document.getElementById.bind(document);

const MAX_DRILL_VALUES = 10;
const RE_SPARQL_PATH: RegExp = /!?\^?[a-z]*:(P[1-9][0-9]*|[A-Za-z]+)[*+?]?([|/]!?\^?[a-z]*:(P[1-9][0-9]*|[A-Za-z]+)[*+?]?)*/;
const WQS_SPARQL_API_ENDPOINT = 'https://query.wikidata.org/sparql?format=json&query=';
const QID_URI_PREFIX = 'http://www.wikidata.org/entity/';
const QID_URI_PREFIX_LENGTH = QID_URI_PREFIX.length;
const PROP_URI_PREFIX = 'http://www.wikidata.org/prop/';
const PROP_URI_PREFIX_LENGTH = PROP_URI_PREFIX.length;

class PropertyUsage {
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

function formatValue(type: string, value: string): string {
    switch (type) {
        case 'uri':
            return value.startsWith(QID_URI_PREFIX) ? uriToQid(value) : value;

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
            return value.startsWith(QID_URI_PREFIX) ? 'wd:' + value.substring(QID_URI_PREFIX_LENGTH) : `<${value}>`;

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
    const $btnDeleteNode = $('btnDeleteNode') as HTMLButtonElement;
    const $btnWqs = $('btnWqs') as HTMLButtonElement;
    const $btnLoadProps = $('btnLoadProps') as HTMLButtonElement;
    const $btnDrillProp = $('btnDrillProp') as HTMLButtonElement;
    const $btnDrillCustomProp = $('btnDrillCustomProp') as HTMLButtonElement;

    $('selectionLabel').addEventListener('click', editNodeLabel);
    $('btnAddQuery').addEventListener('click', showInitialQueryDialog);
    $('btnDeleteNode').addEventListener('click', deleteNode);
    $btnWqs.addEventListener('click', openNodeInWqs);
    $btnLoadProps.addEventListener('click', loadItemSetProps);
    $btnDrillProp.addEventListener('click', showDrillPropDialog);
    $btnDrillCustomProp.addEventListener('click', drillCustomProp);

    $dlgQuery.addEventListener('close', addQueryNode);
    $dlgDrillProp.addEventListener('close', drillProp);

    const options: vis.Options = {
        nodes: {
            scaling: {
                min: 1,
                max: 10,
                label: {
                    enabled: true,
                    min: 10,
                    max: 50
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
            option.text = `${prop.property} (${prop.count})`;
            $boxDrillPropProperty.add(option);
        }

        $dlgDrillProp.showModal();
    }

    function addQueryNode() {
        if (!$dlgQuery.returnValue) return;

        const query = $editQuerySparql.value;

        runQuery(
            `SELECT (COUNT(?item) AS ?driller_count) WHERE { ${query} }`,
            queryResults => {
                let resultCount = queryResults.length;
                if (resultCount != 1) {
                    toastError('Unexpected result from WQS query');
                    return;
                }

                const itemCount = queryResults[0].driller_count.value;
                const node = new QueryItemSet('Query ' + (nodes.length + 1), query, itemCount);
                const nodeOptions = node as vis.NodeOptions;
                // nodeOptions.physics = false;
                nodeOptions.mass = nodeOptions.value = 1 + Math.log10(itemCount);
                addNode(node);
                network.selectNodes([node.id]);
                updateSelection();
            },
            error => {
                toastError('WQS request failed');
            }
        );
    }

    function loadItemSetProps() {
        const node = getSelectedNode();
        if (!node?.canQuery()) return;

        runQuery(
            // TODO: p: or wdt:?
            `SELECT ?driller_prop ?driller_count WHERE { { SELECT ?driller_prop (COUNT(?item) AS ?driller_count) WHERE { { ${node.computeQuery()} } ?item ?driller_prop []. } GROUP BY ?driller_prop\n}FILTER(STRSTARTS(STR(?driller_prop), "http://www.wikidata.org/prop/P")) } ORDER BY DESC (?driller_count)`,
            queryResults => {
                let resultCount = queryResults.length;
                if (!resultCount) {
                    // strange indeed!
                    toastWarning('No properties found');
                    return;
                }

                let availableProperties: PropertyUsage[] = [];

                for (let i = 0; i < resultCount; ++i) {
                    const property: string = queryResults[i].driller_prop.value;
                    const count: number = +queryResults[i].driller_count.value;

                    availableProperties.push(new PropertyUsage(uriToProp(property), count));
                }

                node.availableProperties = availableProperties;
                updateSelection();
                toastInfo(`${resultCount} properties loaded`);
            },
            error => {
                toastError('WQS request failed');
            }
        );
    }

    function drillProp() {
        if (!$dlgDrillProp.returnValue) return;

        const node = getSelectedNode();
        if (!node?.canQuery()) return;
        if (!$boxDrillPropProperty.selectedOptions.length) return;

        const selectedOption = $boxDrillPropProperty.selectedOptions[0];
        const prop = selectedOption.value;

        // TODO: wdt: or p:/ps:?
        runDrillProp(node, `p:${prop}/ps:${prop}`, prop);
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
            `SELECT ?driller_value (COUNT(?item) AS ?driller_count) WHERE { { ${node.computeQuery()} } ?item ${prop} ?driller_value } GROUP BY ?driller_value\nORDER BY DESC(?driller_count)\nLIMIT ${MAX_DRILL_VALUES + 1}`,
            queryResults => {
                let resultCount = queryResults.length;
                if (!resultCount) {
                    toastWarning('No such claim');
                    return;
                }

                if (resultCount > MAX_DRILL_VALUES) {
                    toastWarning(`Too many values, showing ${MAX_DRILL_VALUES} most common`);
                    resultCount = MAX_DRILL_VALUES;
                }

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
            },
            error => {
                toastError('WQS request failed');
            }
        );
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
        return selectedNodeIds.length ? nodes.get(selectedNodeIds[0]) : null;
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
        const selectedNode = getSelectedNode();
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

        setVisible($btnWqs, canQuery, 'inline');
        setVisible($btnLoadProps, canQuery && !loadedProperties, 'inline');
        setVisible($btnDrillProp, canQuery && loadedProperties, 'inline');
        setVisible($btnDrillCustomProp, canQuery, 'inline');
    }

    function openNodeInWqs() {
        const selectedNode = getSelectedNode();
        if (!selectedNode || !selectedNode.canQuery()) return;

        window.open('https://query.wikidata.org/#' + encodeURIComponent('SELECT ?item ?itemLabel WHERE {\n\t' + selectedNode.computeQuery().replace(/\\n/g, '\n\t') + '\n\tSERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }\n}'))
    }

    function runQuery(sparql: string, resultCallback: (result: any[]) => void, errorCallback: (error: string) => void) {
        spinnerOn();

        fetch(WQS_SPARQL_API_ENDPOINT + encodeURIComponent(sparql))
            .then((response) => {
                if (response.status !== 200) {
                    return response.text().then(errText => {
                        console.error('Failed executing SPARQL query', sparql, response, errText);
                        spinnerOff();
                        errorCallback(errText);
                    });
                }

                return response.json().then(result => {
                    spinnerOff();
                    resultCallback(result.results.bindings);
                });
            });
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

    spinnerOff();
}

window.onload = init;
