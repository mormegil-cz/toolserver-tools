import * as Toastify from 'toastify-js';
import * as vis from 'vis-network/standalone';

const $: (elementId: string) => HTMLElement | null = document.getElementById.bind(document);

const MAX_DRILL_VALUES = 10;
const RE_SPARQL_PATH: RegExp = /!?\^?P[1-9][0-9]*[*+?]?([|/]!?\^?P[1-9][0-9]*[*+?]?)*/;
const WQS_SPARQL_API_ENDPOINT = 'https://query.wikidata.org/sparql?format=json&query=';

interface QueryableNode {
    computeQuery(): string;
}

abstract class GraphNode implements vis.Node {
    private static currentId: number = 0;

    public readonly id: number;

    protected constructor(
        public label: string,
        public shape: string,
    ) {
        this.id = GraphNode.currentId++;
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
    public abstract computeQuery(): string;

    public override canQuery(): boolean {
        return true;
    }
}

class QueryItemSet extends ItemSet {
    constructor(
        label: string,
        public readonly query: string,
    ) {
        super(label, 'box');
    }

    public override computeQuery(): string {
        return this.query;
    }
}

function padNumber(num: number, digits: number): string {
    return num.toFixed(0).padStart(digits, '0');
}

function formatValue(type: string, value: string): string {
    switch (type) {
        case 'uri':
            return value.startsWith('http://www.wikidata.org/entity/') ? value.substring('http://www.wikidata.org/entity/'.length) : value;

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
            return value.startsWith('http://www.wikidata.org/entity/') ? 'wd:' + value.substring('http://www.wikidata.org/entity/'.length) : `<${value}>`;

        case 'http://www.w3.org/2001/XMLSchema#dateTime':
            return `"${value}"^^xsd:dateTime`;

        default:
            const jsoned = JSON.stringify(value);
            return `'${jsoned.substring(1, jsoned.length - 2).replace(/'/g, "\\'")}'`;
    }
}

function showToast(msg: string, className: string) {
    Toastify({
        text: msg,
        className: className
    }).showToast();
}

function toastWarning(msg: string) {
    showToast(msg, 'warning');
}

function toastError(msg: string) {
    showToast(msg, 'error');
}

const nodes = new vis.DataSet<GraphNode>([]);
const edges = new vis.DataSet<vis.Edge>([]);

function init() {
    const $selectionLabel = $('selectionLabel');
    const $selectionToolbox = $('selectionToolbox');
    const $btnLoadProps = $('btnLoadProps') as HTMLButtonElement;
    const $editQuerySparql = $('editQuerySparql') as HTMLTextAreaElement;
    // any because of old typings, not yet released: https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1258
    const $dlgQuery: any = $('dlgQuery') as HTMLDialogElement;
    const $btnDeleteNode = $('btnDeleteNode') as HTMLButtonElement;

    $('selectionLabel').addEventListener('click', editNodeLabel);
    $('btnAddQuery').addEventListener('click', showInitialQueryDialog);
    $('btnDeleteNode').addEventListener('click', deleteNode);
    $('btnWqs').addEventListener('click', openNodeInWqs);
    $('btnDrillCustomProp').addEventListener('click', drillCustomProp);

    $dlgQuery.addEventListener('close', addQueryNode);

    const options = {};
    const data = {
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
        updateSelection();
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

    function addQueryNode() {
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
                const node = new QueryItemSet('Query ' + (nodes.length + 1) + '\n' + itemCount, query);
                const nodeOptions = node as vis.NodeOptions;
                // nodeOptions.physics = false;
                // nodeOptions.value = 1 + Math.log10(itemCount);
                addNode(node);
            },
            error => {
                toastError('WQS request failed');
            }
        );
    }

    function drillCustomProp() {
        const node = getSelectedNode();
        if (!node?.canQuery()) return;

        let prop = prompt('Property: ', 'P31');
        if (!prop) return;
        prop = prop.toUpperCase();
        if (!RE_SPARQL_PATH.test(prop)) {
            toastWarning('Invalid property path syntax');
            return;
        }

        const sparqlPropPath = prop.replace(/P/g, 'wdt:P');

        runQuery(
            `SELECT ?driller_value (COUNT(?item) AS ?driller_count) WHERE { { ${node.computeQuery()} } ?item ${sparqlPropPath} ?driller_value } GROUP BY ?driller_value\nORDER BY DESC(?driller_count)\nLIMIT ${MAX_DRILL_VALUES + 1}`,
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

                const drillPropertyNode = new DrillDownPropertyNode(prop);
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

                    const valueNode = new QueryItemSet(valueLabel + '\n' + count, `{ { ${node.computeQuery()} } ?item ${sparqlPropPath} ${valueSparql} }`);
                    const nodeOptions = valueNode as vis.NodeOptions;
                    // nodeOptions.value = 1 + Math.log10(count);

                    addNode(valueNode);
                    addEdge(drillPropertyNode, valueNode);
                }

                network.focus(drillPropertyNode.id);
                network.fit();
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
        const editedCaption = prompt('Node caption:', selectedNode.label);
        if (editedCaption) {
            selectedNode.label = editedCaption;
            $selectionLabel.innerText = editedCaption;
            nodes.update(selectedNode);
        }
    }

    function updateSelection() {
        const selectedNode = getSelectedNode();
        if (selectedNode) {
            $selectionLabel.innerText = selectedNode.label;
            $selectionToolbox.style.visibility = 'visible';
        } else {
            $selectionLabel.innerText = '';
            $selectionToolbox.style.visibility = 'hidden';
        }
    }

    function openNodeInWqs() {
        const selectedNode = getSelectedNode();
        if (!selectedNode || !selectedNode.canQuery()) return;

        window.open('https://query.wikidata.org/#' + encodeURIComponent('SELECT ?item WHERE {\n\t' + selectedNode.computeQuery().replace(/\\n/g, '\n\t') + '\n}'))
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
