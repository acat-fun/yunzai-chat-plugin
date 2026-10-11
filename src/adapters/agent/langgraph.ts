import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import type { AgentPort } from '../../application/ports/agent.js';
import type { GenerationResult } from '../../application/ports/index.js';
const State = Annotation.Root({
  result: Annotation<GenerationResult | undefined>(),
});
/** 每次运行独立图状态，不使用全局检查点保存用户数据或 API 密钥。 */
export class LangGraphAgent implements AgentPort {
  async run(
    step: () => Promise<GenerationResult | undefined>,
    signal: AbortSignal,
    recursionLimit: number,
    tools?: () => Promise<GenerationResult | undefined>,
  ): Promise<GenerationResult> {
    const graph = new StateGraph(State)
      .addNode('model', async () => {
        signal.throwIfAborted();
        return { result: await step() };
      })
      .addNode('tools', async () => {
        signal.throwIfAborted();
        return { result: await tools!() };
      })
      .addEdge(START, 'model')
      .addConditionalEdges('model', (state) =>
        state.result ? END : tools ? 'tools' : 'model',
      )
      .addConditionalEdges('tools', (state) => (state.result ? END : 'model'))
      .compile();
    const output = await graph.invoke({}, { signal, recursionLimit });
    if (!output.result) throw new Error('Agent 未返回结果');
    return output.result;
  }
}
