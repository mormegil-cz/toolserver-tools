const $: (elementId: string) => HTMLElement | null = document.getElementById.bind(document);

interface ClickedNode {
    nodeId: number;
    labelId?: number;
}

interface ClickedEdge {
    edgeId: number;
    labelId?: number;
}

interface ClickProperties extends vis.Properties {
    items: (ClickedNode | ClickedEdge)[];
}

function isClickedEdge(p: ClickedNode | ClickedEdge): p is ClickedEdge {
    return "edgeId" in p;
}

function isClickedNode(p: ClickedNode | ClickedEdge): p is ClickedEdge {
    return "nodeId" in p;
}

interface QueryableNode {
    computeQuery(): string;
}

abstract class GraphNode implements vis.Node {
    protected constructor(
        public readonly id: number,
        public label: string,
        public shape: string,
    ) {
    }

    public abstract canQuery(): this is QueryableNode;
}

class DummyNode extends GraphNode {
    public constructor(
        id: number,
        label: string,
    ) {
        super(id, label, 'big ellipse');
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
        id: number,
        label: string,
        public readonly query: string,
    ) {
        super(id, label, 'big box');
    }

    public override computeQuery(): string {
        return this.query;
    }
}

const nodes = new vis.DataSet<GraphNode>([]);
const edges = new vis.DataSet<vis.Edge>([]);

function init() {
    const $selectionLabel = $('selectionLabel');
    const $selectionToolbox = $('selectionToolbox');
    const $btnLoadProps = $('btnLoadProps') as HTMLButtonElement;
    const $dlgQuery = $('dlgQuery') as HTMLDialogElement;
    const $editQuerySparql = $('editQuerySparql') as HTMLTextAreaElement;

    $('selectionLabel').addEventListener('click', editNodeLabel);
    $('btnAddQuery').addEventListener('click', showInitialQueryDialog);
    $dlgQuery.addEventListener('close', addQueryNode);
    $('btnWqs').addEventListener('click', openNodeInWqs);

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

    /*
    setInterval(() => {
        var nodeId = nodes.length + 1;
        nodes.add(new DummyNode(nodeId, "Node " + nodeId));
        edges.add({ id: edges.length + 1, from: nodeId, to: Math.floor(1 + Math.random() * (nodeId - 1)) });
        edges.add({ id: edges.length + 1, from: Math.floor(1 + Math.random() * nodeId), to: Math.floor(1 + Math.random() * nodeId) });
    }, 2000);
    */

    function showInitialQueryDialog() {
        $editQuerySparql.value = 'VALUES ?item { wdt:Q42 }';
        // old typings, not yet released: https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1258
        ($dlgQuery as any).showModal();
    }

    function addQueryNode() {
        const nodeId = nodes.length;
        nodes.add(new QueryItemSet(nodeId, 'Query ' + (nodeId + 1), $editQuerySparql.value));
        network.focus(nodeId);
        network.fit();
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
}

window.onload = init;
