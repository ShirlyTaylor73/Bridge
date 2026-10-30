
async function loadJson(file) {
  const response = await fetch(file, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${file}：HTTP ${response.status}`);
  return response.json();
}
async function start() {
    const DATA=await loadJson('base/tree.json');
    let indexError='';
    let index={topics:[]};
    try { index=await loadJson('explorations/index.json'); if(!Array.isArray(index.topics))throw new Error('索引格式无效'); }
    catch(error){indexError=error.message;}

    const REPO_ROOT=DATA.project.root;
    const CATEGORIES={core:'核心业务',adapter:'接口适配',data:'数据模型',infra:'基础设施',utility:'通用工具',test:'测试',docs:'文档'};
    const KINDS={calls:'直接调用',http:'HTTP / SSE',callback:'回调注入'};
    const ICONS={folder:'<svg class="icon folder-icon" viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',chevron:'<svg class="icon chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',external:'<svg class="icon" viewBox="0 0 24 24"><path d="M14 3h7v7m0-7-9 9"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',tree:'<svg class="icon" viewBox="0 0 24 24"><path d="M12 3v5m0 0H6v5m6-5h6v5M6 13v5m12-5v5"/><circle cx="12" cy="3" r="1"/><circle cx="6" cy="19" r="1"/><circle cx="18" cy="19" r="1"/></svg>',play:'<svg class="icon" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>',dashboard:'<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>'};
    const nodes=DATA.nodes,flows={};
    let evidence={},currentTopic=null,requestId=0,loadError='';
    const views=[{id:'base',name:'基础文件树',desc:'目录、分类与入口',icon:'tree'},...index.topics.map(topic=>({...topic,name:topic.title,desc:topic.summary,icon:'play'}))];
    const state={view:'base',selectedNode:null,search:'',expand:false,expandedCode:new Set(),expandedDirs:new Set(),inspectorOpen:false,topicSearch:'',treeSearch:'',treeScroll:0};
    const nodeMap=new Map(),fileCounts=new Map();
    function walk(items,parent=null){for(const node of items){nodeMap.set(node.id,{...node,parent});if(node.children){if(node.open)state.expandedDirs.add(node.id);walk(node.children,node.id);fileCounts.set(node.id,(node.children||[]).filter(child=>child.kind==='file').length)}}}walk(nodes);
    const byId=id=>nodeMap.get(id),viewById=id=>views.find(view=>view.id===id);
    const files=[...nodeMap.values()].filter(node=>node.kind==='file');
    state.selectedNode=files[0]?.id||nodes[0]?.id||null;
    const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const vscodeLink=(path,line=null,column=1)=>{const full=[REPO_ROOT,path].filter(Boolean).join('/'),encoded=full.split('/').map(encodeURIComponent).join('/');return`vscode://file${encoded}${line?`:${line}:${column}`:''}`};
    document.getElementById('repo-name').textContent=DATA.project.name;
    document.getElementById('repo-commit').textContent=DATA.project.commit?DATA.project.commit.slice(0,7):'非 Git 快照';
    document.getElementById('repo-count').textContent=`${DATA.project.fileCount} 个仓库文件`;
    document.title=`Bridge · ${DATA.project.name} 仓库理解`;
    document.querySelectorAll('[data-open-path]').forEach(link=>{link.href=vscodeLink(link.dataset.openPath)});
    function matches(node){if(!state.search)return true;return`${node.name} ${node.path} ${node.summary||''}`.toLowerCase().includes(state.search.toLowerCase())}
    function hasMatch(node){return matches(node)||(node.children||[]).some(hasMatch)}
    function renderShell(){
      const viewButton=view=>`<button class="view-button ${state.view===view.id?'active':''}" data-view="${esc(view.id)}"><span class="view-icon">${ICONS[view.icon]}</span><span><span class="view-name">${esc(view.name)}</span><span class="view-desc">${esc(view.desc)}</span></span></button>`;
      document.getElementById('view-list').innerHTML=`<p class="eyebrow view-group-label">结构视图</p>${viewButton(views[0])}<p class="eyebrow view-group-label">调用视图</p>${views.slice(1).filter(view=>`${view.name} ${view.desc} ${(view.keywords||[]).join(' ')}`.toLowerCase().includes(state.topicSearch.toLowerCase())).map(viewButton).join('')||'<p class="sidebar-note">使用 explore 添加主题，或调整搜索关键词。</p>'}${indexError?`<p class="sidebar-note">索引加载失败：${esc(indexError)}</p>`:''}`;
      document.getElementById('legend').innerHTML=Object.entries(CATEGORIES).map(([id,name])=>`<div class="legend-item"><span class="dot bg-${id}"></span>${name}</div>`).join('');
      document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>selectView(button.dataset.view)));
      const project=state.view==='base'?DATA.project:currentTopic?.project;
      document.getElementById('repo-commit').textContent=project?.commit?project.commit.slice(0,7):'非 Git 快照';
      const counts={};files.forEach(file=>counts[file.category]=(counts[file.category]||0)+1);
      document.getElementById('distribution').innerHTML=Object.entries(counts).map(([id,count])=>`<span class="bg-${id}" style="width:${count/files.length*100}%" title="${CATEGORIES[id]} ${count}"></span>`).join('');
      const phases=flows[state.view]||[],flowCount=phases.flatMap(phase=>phase.steps).length;
      document.getElementById('file-count').textContent=state.view==='base'?`${files.length} 个文件`:`${phases.length} 个阶段 / ${flowCount} 个代码位置`;
      document.getElementById('view-meta').innerHTML=state.view==='base'?'<span>浏览目录结构、文件分类与职责，点击文件查看详情。</span>':'<span>阶段 → 关键调用行 → 注释源码 → VS Code 精确位置</span>';
      if(project)document.getElementById('view-meta').append(document.createTextNode(` · 分析时间：${project.generatedAt}`));
      document.getElementById('workspace-title').textContent=state.view==='base'?'仓库文件树':`${viewById(state.view).name} · 调用框图`;
      document.getElementById('expand').title=state.view==='base'?'展开或收起目录':'展开或收起全部源码';
      document.getElementById('search').placeholder=state.view==='base'?'搜索目录、文件或职责…':'搜索路径、类、函数或调用…';
    }
    function renderTree(){
      function renderNode(node){
        if(!hasMatch(node))return'';
        if(node.kind==='dir'){
          const children=(node.children||[]).map(renderNode).join('');if(!children)return'';
          const open=Boolean(state.search)||state.expandedDirs.has(node.id);
          return`<details class="dir" data-dir="${esc(node.id)}" ${open?'open':''}><summary>${ICONS.chevron}${ICONS.folder}<span class="dir-name">${esc(node.name)}</span><span class="dir-summary">${esc(node.summary)}</span><span class="dir-count">${fileCounts.get(node.id)||0} 文件</span></summary><div class="dir-children">${children}</div></details>`;
        }
        return`<div class="file-row base-file ${state.selectedNode===node.id?'selected':''}" data-node="${esc(node.id)}" data-category="${esc(node.category)}"><span class="file-dot bg-${esc(node.category)}"></span><span class="file-name">${esc(node.name)}</span>${node.entry?`<span class="entry-tag">${esc(node.entry)}</span>`:''}<span class="file-summary">${esc(node.summary)}</span><div class="row-actions"><a class="row-action" href="${vscodeLink(node.path)}" title="在 VS Code 中打开">${ICONS.external}</a></div></div>`;
      }
      document.getElementById('tree-content').innerHTML=nodes.map(renderNode).join('')||'<div class="empty">当前视角没有匹配文件</div>';
      document.querySelectorAll('[data-dir]').forEach(details=>details.addEventListener('toggle',()=>{if(!details.isConnected||state.search)return;if(details.open)state.expandedDirs.add(details.dataset.dir);else state.expandedDirs.delete(details.dataset.dir)}));
      document.querySelectorAll('[data-node]').forEach(row=>row.addEventListener('click',()=>selectNode(row.dataset.node)));
      document.querySelectorAll('.row-action[href]').forEach(link=>link.addEventListener('click',event=>event.stopPropagation()));
      document.getElementById('relation-status').innerHTML='<span>点击文件查看职责；通过 VS Code 链接阅读完整源码。</span>';
    }
    function codeBlock(key){
      const item=evidence[key],lines=item.code.split('\n'),noteLine=item.highlight[0];
      return`<div class="code-block" aria-label="${esc(item.path)} 源码与 Agent 注释">${lines.map((line,index)=>{const number=item.start+index,highlight=number>=item.highlight[0]&&number<=item.highlight[1],note=number===noteLine?item.annotation:null;return`<div class="code-line ${highlight?'highlight':''}"><span class="line-number">${number}</span><span class="code-text">${esc(line)||' '}</span></div>${note?`<div class="agent-note"><span class="agent-note-tag">Agent<br>注释</span><span class="agent-note-text">${esc(note)}</span></div>`:''}`}).join('')}</div>`;
    }
    function flowConnector(step){
      const kind=step.kind||'calls',label=kind==='sequence'?'流程继续':KINDS[kind];
      return`<div class="flow-connector ${kind}" aria-label="${esc(label)}：${esc(step.via)}"><div class="flow-edge-label"><span class="flow-edge-kind">${esc(label)}</span><code class="flow-edge-call">${esc(step.via)}</code></div></div>`;
    }
    function flowNode(step){
      const item=evidence[step.key],line=item.highlight[0],keyLine=item.code.split('\n')[line-item.start].trim(),open=state.expand||state.expandedCode.has(step.key);
      return`<article class="flow-node" data-flow-node="${esc(step.key)}"><div class="flow-node-head"><div class="flow-node-ident"><span class="flow-node-path mono">${esc(item.path)}</span><span class="flow-node-symbol mono">${esc(item.symbol)}</span></div><span class="flow-node-line mono">L${item.start}${item.end!==item.start?`–${item.end}`:''}</span><a class="flow-vscode" href="${vscodeLink(item.path,line,1)}" title="在 VS Code 打开第 ${line} 行" aria-label="在 VS Code 打开 ${esc(item.path)} 第 ${line} 行">${ICONS.external}</a></div>${step.object?`<p class="flow-object">对象 / 类型：<code>${esc(step.object)}</code></p>`:''}<div class="flow-key-line"><span class="flow-key-label">关键行 · L${line}</span><code class="flow-key-code" title="${esc(keyLine)}">${esc(keyLine)}</code></div><details class="flow-source" data-code-key="${esc(step.key)}" ${open?'open':''}><summary>展开源码与 Agent 注释</summary>${codeBlock(step.key)}${(step.extra||[]).map(key=>{const extra=evidence[key],extraLine=extra.highlight[0];return`<div class="evidence-head"><span class="evidence-role">${esc(extra.role)}</span><a class="small-link" href="${vscodeLink(extra.path,extraLine,1)}" title="在 VS Code 打开第 ${extraLine} 行">${ICONS.external} L${extraLine}</a></div>${codeBlock(key)}`}).join('')}</details></article>`;
    }
    function renderFlow(){
      if(loadError){document.getElementById('flow-canvas').innerHTML=`<div class="flow-empty">${esc(loadError)}<br>可选择其他主题；刷新页面后重试。</div>`;return;}
      const phases=flows[state.view]||[],query=state.search.toLowerCase();
      const html=phases.map((phase,index)=>{const steps=phase.steps.filter(step=>{const item=evidence[step.key];return!query||`${item.path} ${item.symbol} ${item.code} ${step.via||''} ${step.object||''}`.toLowerCase().includes(query)});if(!steps.length)return'';return`<details class="flow-phase" ${index===0||query?'open':''}><summary><span class="phase-number">${index+1}</span><span class="phase-heading"><span class="phase-title">${esc(phase.title)}</span><span class="phase-desc">${esc(phase.desc)}</span></span><span class="phase-count">${steps.length} 个位置</span>${ICONS.chevron}</summary><div class="phase-body">${steps.map((step,stepIndex)=>`${stepIndex?flowConnector(step):''}${flowNode(step)}`).join('')}</div></details>`}).join('');
      document.getElementById('flow-canvas').innerHTML=`<div class="flow-intro"><span>默认收起源码，点击卡片底部展开</span><div class="flow-legend"><span><i></i>调用</span><span class="sequence"><i></i>流程继续</span></div></div>${html||'<div class="flow-empty">没有匹配的代码位置或调用方式</div>'}`;
      document.querySelectorAll('[data-code-key]').forEach(details=>details.addEventListener('toggle',()=>{if(!details.isConnected||state.expand)return;if(details.open)state.expandedCode.add(details.dataset.codeKey);else state.expandedCode.delete(details.dataset.codeKey)}));
      const status=document.getElementById('relation-status');status.classList.remove('active');status.innerHTML='<span>实线表示真实调用；灰色连接只表示流程先后。Agent 注释与原始源码分开显示。</span>';
    }
    function renderInspector(){
      const node=byId(state.selectedNode)||files[0]||nodes[0];
      if(!node){document.getElementById('inspector-inner').innerHTML='<div class="empty">没有可显示的文件</div>';return}
      const html=`<p class="eyebrow">${node.kind==='dir'?'目录概览':'文件职责'}</p><h2>${esc(node.name)}</h2>${node.kind==='file'?`<span class="category-pill category-${esc(node.category)}"><span class="dot bg-${esc(node.category)}"></span>${CATEGORIES[node.category]}</span>`:''}<div class="inspector-path mono">${esc(node.path)}</div><p class="inspector-description">${esc(node.summary)}</p>${node.kind==='file'?`<a class="vscode-button" href="${vscodeLink(node.path)}">${ICONS.external}在 VS Code 中打开文件</a>`:''}<section class="inspector-section"><h3>结构信息</h3><dl class="detail-list"><dt>节点类型</dt><dd>${node.kind==='dir'?'目录':'文件'}</dd>${node.entry?`<dt>入口</dt><dd>${esc(node.entry)}</dd>`:''}</dl></section><div class="hint-box">结构视图只展示目录和文件职责。需要理解运行过程时，从侧边栏进入对应的调用视图。</div><p class="footer-note">文件摘要基于 ${esc(DATA.project.commit||'当前文件')} 的静态快照，可通过 VS Code 链接阅读当前完整源码。</p>`;
      document.getElementById('inspector-inner').innerHTML=html;
    }
    function renderContent(){if(state.view==='base')renderTree();else renderFlow()}
    function render(){
      const flowMode=state.view!=='base';document.getElementById('layout').classList.toggle('flow-mode',flowMode);if(flowMode)state.inspectorOpen=false;
      renderShell();if(flowMode)renderFlow();else{renderTree();renderInspector()}document.getElementById('inspector').classList.toggle('open',state.inspectorOpen);
    }
    async function selectView(id){
      const selected=viewById(id);if(!selected)return;
      if(state.view==='base'){state.treeSearch=state.search;state.treeScroll=document.getElementById('tree-scroll').scrollTop;}
      const token=++requestId;
      state.view=id;state.expand=false;state.expandedCode.clear();
      state.search=id==='base'?state.treeSearch:'';
      document.getElementById('search').value=state.search;
      document.getElementById('flow-scroll').scrollTop=0;
      history.replaceState(null,'',`?view=${encodeURIComponent(id)}`);
      loadError='';currentTopic=null;evidence={};
      if(id!=='base'){
        loadError='正在加载主题…';render();
        try {
          if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)||selected.path!==`explorations/${id}.json`)throw new Error('主题路径无效');
          const topic=await loadJson(selected.path);
          if(token!==requestId)return;
          if(topic.id!==id||!Array.isArray(topic.phases)||!topic.evidence)throw new Error('主题数据格式无效');
          currentTopic=topic;evidence=topic.evidence;flows[id]=topic.phases;loadError='';
          render();
        } catch(error){if(token!==requestId)return;loadError=`主题 ${selected.path} 加载失败：${error.message}`;render();}
      } else {render();document.getElementById('tree-scroll').scrollTop=state.treeScroll;}
    }
    function selectNode(id){
      state.selectedNode=id;
      document.querySelectorAll('[data-node]').forEach(row=>row.classList.toggle('selected',row.dataset.node===id));
      renderInspector();if(window.innerWidth<=1120)openInspector();
    }
    function openInspector(){state.inspectorOpen=true;document.getElementById('inspector').classList.add('open')}
    document.getElementById('search').addEventListener('input',event=>{state.search=event.target.value.trim();if(state.view==='base')state.treeSearch=state.search;renderContent()});
    document.getElementById('expand').addEventListener('click',()=>{
      if(state.view==='base'){
        const dirs=[...nodeMap.values()].filter(node=>node.kind==='dir');
        const all=dirs.every(node=>state.expandedDirs.has(node.id));
        state.expandedDirs=new Set(all?[]:dirs.map(node=>node.id));
        // 全局展开/收起同时结束搜索，使按钮结果可见。
        state.search='';state.treeSearch='';document.getElementById('search').value='';
      } else {state.expand=!state.expand;if(!state.expand)state.expandedCode.clear();}
      renderContent();
    });
    document.getElementById('topic-search').addEventListener('input',event=>{state.topicSearch=event.target.value.trim();renderShell()});
    document.getElementById('mobile-inspector').addEventListener('click',openInspector);
    document.getElementById('inspector-close').addEventListener('click',()=>{state.inspectorOpen=false;document.getElementById('inspector').classList.remove('open')});
    const requested=new URLSearchParams(location.search).get('view');
    render();
    if(views.some(view=>view.id===requested))await selectView(requested);

}
start().catch(error=>{document.getElementById('tree-content').textContent=`基础树加载失败：${error.message}。请先运行 bridge，并通过本地 HTTP 服务打开页面。`;});
