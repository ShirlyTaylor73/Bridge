import { createValidator } from './validate-analysis.mjs';
import { topicId } from './storage.mjs';

const requireText = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} 必须为非空文本`); };
export function validateBase(root, tree, scan) {
  if (tree.version !== 2 || Object.keys(tree).some(key => !['version', 'project', 'nodes'].includes(key))) throw new Error('基础树格式：version=2，project，nodes');
  const validator = createValidator(root);
  validator.validateScan(scan);
  validator.validateAnalysis({ ...tree, version: 1, evidence: {}, views: [] });
  const result = validator.finish();
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  return result;
}
export function validateExploration(root, data, scan) {
  if (data.version !== 2 || Object.keys(data).some(key => !['version', 'id', 'title', 'summary', 'keywords', 'question', 'project', 'evidence', 'phases'].includes(key))) throw new Error('探索格式无效');
  topicId(data.id);
  for (const key of ['title', 'summary', 'question']) requireText(data[key], key);
  if (!Array.isArray(data.keywords) || !data.keywords.length) throw new Error('keywords 需要主题关键词');
  data.keywords.forEach(value => requireText(value, 'keyword'));
  if (!data.project || Object.keys(data.project).some(key => !['root', 'commit', 'generatedAt'].includes(key))) throw new Error('探索 project 仅包含 root、commit、generatedAt');
  const validator = createValidator(root, { exploration: true });
  validator.validateScan(scan);
  validator.validateAnalysis({ version: 1,
    project: { ...data.project, name: data.title, fileCount: scan.files.length },
    nodes: [], evidence: data.evidence,
    views: [{ id: data.id, name: data.title, desc: data.summary, icon: 'play', phases: data.phases }],
  });
  const result = validator.finish();
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  return result;
}
