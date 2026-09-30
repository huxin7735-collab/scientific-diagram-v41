// specs.mjs — 13 张图的图数据（节点/边/容器），全部内容取自 流程图/case0X-*.md 正文
// 依据 skill scientific-diagram-v41：
//   §2 约束 9 + §10.8 大步骤-小步骤从属必须容器化（禁止拍平成同层单链）；
//   §10.10 流程图标准图元：首节点 start（胶囊）、终点 end/focusend、判定用 decision（菱形）且出边带 是/否；
//   §6 预算：视觉单元 ≤9（容器计 1、容器内小步骤计 0.5）、箭头 ≤12、焦点色 ≤2。
// 每节点文字 ≤2 行且宽度 ≤216px（见 build.mjs 校验）。
//
// 判定菱形（decision）只出现在来源文本确有"条件 / 到达"语义处：
//   case03-1「SSE 下降速度减缓」← "当簇个数达到某一值时 SSE 下降速度减缓，该处即为最优 K"
//   case03-2「到达 N 个训练子集」← "有放回随机抽样 N 个训练样本集分别构建决策树"
//   case05-1「达到 35dBZ 与 256 km²」← "根据强度阈值（35dBZ）和面积阈值（256 km²）进行数据筛选"
// 其余 10 图来源无判定环节（与参照物 图6-2 同为纯线性流程，参照物该图亦无菱形）。

export const figures = [
  /* ================= A 类：技术路线图 ================= */
  {
    file: 'case01-1-技术路线总览',
    category: 'A-技术路线图',
    title: 'case01 抗乳腺癌研究 · 技术路线总览',
    mainline: '729 个分子描述符 → 数据观察与预处理 → 分步集成筛选模型 → 分问题建模与验证 → 问题四组合优化与变量范围可视化',
    source: '流程图/case01-抗乳腺癌技术路线.md',
    containers: [
      { id: 'C1', title: '分问题建模', children: ['n4', 'n5', 'n6'] }
    ],
    nodes: [
      { id: 'n1', layer: 0, lane: 0, type: 'start',   lines: ['数据观察与预处理', '剔除低方差与重复特征'] },
      { id: 'n2', layer: 1, lane: 0, type: 'focus',   lines: ['分步集成筛选模型', '137 维 + 20 显著'] },
      { id: 'n3', layer: 2, lane: 0, type: 'step',    lines: ['分问题建模'] },
      { id: 'n4', layer: 3, lane: 0, type: 'step',    lines: ['① 问题三分类建模', '深度随机森林/原型网络'] },
      { id: 'n5', layer: 4, lane: 0, type: 'step',    lines: ['② 问题二回归建模', 'Stacking 集成'] },
      { id: 'n6', layer: 5, lane: 0, type: 'step',    lines: ['③ 特征重要性分析', '模型交叉验证'] },
      { id: 'n7', layer: 6, lane: 0, type: 'focus',   lines: ['问题四组合优化', 'PSO 确定搜索范围'] },
      { id: 'n8', layer: 7, lane: 0, type: 'end',     lines: ['变量范围可视化分析'] }
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '341 维变量' },
      { from: 'n2', to: 'n3', label: '建模变量集' },
      { from: 'n3', to: 'n4', label: null },
      { from: 'n3', to: 'n5', label: null },
      { from: 'n3', to: 'n6', label: null },
      { from: 'n3', to: 'n7', label: '验证结论' },
      { from: 'n7', to: 'n8', label: '寻优结果' }
    ]
  },
  {
    file: 'case01-2-分步集成筛选模型',
    category: 'A-技术路线图',
    title: 'case01 抗乳腺癌研究 · 分步集成筛选模型（特征选择细节）',
    mainline: '341 维 → 去类内冗余 280 维 → 问题一特征选择取前 20 显著 → 去类间冗余 137 维 → 集成式筛选与独立性代表性验证',
    source: '流程图/case01-抗乳腺癌技术路线.md',
    containers: [
      { id: 'C1', title: '问题一特征选择', children: ['n4', 'n5'] },
      { id: 'C2', title: '集成式筛选与验证', children: ['n8', 'n9'] }
    ],
    nodes: [
      { id: 'n1',  layer: 0, lane: 0, type: 'start',    lines: ['341 维分子描述符', '分步筛选输入'] },
      { id: 'n2',  layer: 1, lane: 0, type: 'step',     lines: ['去除类内冗余特征', '剩余 280 维'] },
      { id: 'n3',  layer: 2, lane: 0, type: 'step',     lines: ['问题一特征选择'] },
      { id: 'n4',  layer: 3, lane: 0, type: 'step',     lines: ['① 重要性排序'] },
      { id: 'n5',  layer: 4, lane: 0, type: 'step',     lines: ['② 保留前 20 个', '重要性显著特征'] },
      { id: 'n6',  layer: 5, lane: 0, type: 'step',     lines: ['去除类间冗余特征', '剩余 137 维'] },
      { id: 'n7',  layer: 6, lane: 0, type: 'step',     lines: ['集成式筛选与验证'] },
      { id: 'n8',  layer: 7, lane: 0, type: 'step',     lines: ['① 集成式特征筛选模型'] },
      { id: 'n9',  layer: 8, lane: 0, type: 'step',     lines: ['② 独立性与代表性验证'] },
      { id: 'n10', layer: 9, lane: 0, type: 'focusend', lines: ['137 维无冗余变量', '20 个显著特征'] }
    ],
    edges: [
      { from: 'n1', to: 'n2',  label: '特征矩阵' },
      { from: 'n2', to: 'n3',  label: '剩余 280 维' },
      { from: 'n3', to: 'n4',  label: null },
      { from: 'n3', to: 'n5',  label: null },
      { from: 'n3', to: 'n6',  label: '筛选结果' },
      { from: 'n6', to: 'n7',  label: '剩余 137 维' },
      { from: 'n7', to: 'n8',  label: null },
      { from: 'n7', to: 'n9',  label: null },
      { from: 'n7', to: 'n10', label: '无冗余变量' }
    ]
  },
  {
    file: 'case01-3-问题四优化建模',
    category: 'A-技术路线图',
    title: 'case01 抗乳腺癌研究 · 问题四组合优化建模（细节）',
    mainline: '在"生物活性更优且至少三个 ADMET 性质较好"约束下，双目标转单目标，PSO 定搜索范围并建立组合优化模型，再做变量范围可视化',
    source: '流程图/case01-抗乳腺癌技术路线.md',
    containers: [
      { id: 'C1', title: '组合优化建模', children: ['n4', 'n5'] }
    ],
    nodes: [
      { id: 'n1', layer: 0, lane: 0, type: 'start',    lines: ['生物活性更优且', '至少三个 ADMET 较好'] },
      { id: 'n2', layer: 1, lane: 0, type: 'step',     lines: ['双目标转单目标', '单目标优化'] },
      { id: 'n3', layer: 2, lane: 0, type: 'step',     lines: ['组合优化建模'] },
      { id: 'n4', layer: 3, lane: 0, type: 'step',     lines: ['① PSO 确定搜索范围'] },
      { id: 'n5', layer: 4, lane: 0, type: 'step',     lines: ['② 建立组合优化模型'] },
      { id: 'n6', layer: 5, lane: 0, type: 'focusend', lines: ['变量范围可视化分析'] }
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '约束条件' },
      { from: 'n2', to: 'n3', label: '单目标函数' },
      { from: 'n3', to: 'n4', label: null },
      { from: 'n3', to: 'n5', label: null },
      { from: 'n3', to: 'n6', label: '寻优结果' }
    ]
  },
  {
    file: 'case04-1-PBS车辆调度技术路线',
    category: 'A-技术路线图',
    title: 'case04 PBS 生产线车辆调度 · 技术路线图',
    mainline: '附件输入 → 问题分析（约束 1–12、目标 1–4 与假设）→ 基本数学模型 → 算法设计（遗传算法/模拟退火）→ 问题一/问题二 π-T 矩阵 → 模型验证',
    source: '流程图/case04-PBS车辆调度.md',
    containers: [
      { id: 'C1', title: '问题分析', children: ['n3', 'n4'] },
      { id: 'C2', title: '算法设计', children: ['n7', 'n8'] }
    ],
    nodes: [
      { id: 'n1',  layer: 0,  lane: 0, type: 'start',    lines: ['输入数据', '附件 1 / 附件 2'] },
      { id: 'n2',  layer: 1,  lane: 0, type: 'step',     lines: ['问题分析'] },
      { id: 'n3',  layer: 2,  lane: 0, type: 'step',     lines: ['① 约束条件 1–12'] },
      { id: 'n4',  layer: 3,  lane: 0, type: 'step',     lines: ['② 优化目标 1–4 与模型假设'] },
      { id: 'n5',  layer: 4,  lane: 0, type: 'step',     lines: ['基本数学模型', '排序 + 分配问题'] },
      { id: 'n6',  layer: 5,  lane: 0, type: 'step',     lines: ['算法设计'] },
      { id: 'n7',  layer: 6,  lane: 0, type: 'step',     lines: ['① 遗传算法'] },
      { id: 'n8',  layer: 7,  lane: 0, type: 'step',     lines: ['② 模拟退火'] },
      { id: 'n9',  layer: 8,  lane: 0, type: 'step',     lines: ['问题一求解', '输出 π-T 矩阵'] },
      { id: 'n10', layer: 9,  lane: 0, type: 'step',     lines: ['问题二求解', '去除约束 6、7 逆向'] },
      { id: 'n11', layer: 10, lane: 0, type: 'focusend', lines: ['模型验证', '理论最优数据集逆向验证'] }
    ],
    edges: [
      { from: 'n1',  to: 'n2',  label: '进车顺序等' },
      { from: 'n2',  to: 'n3',  label: null },
      { from: 'n2',  to: 'n4',  label: null },
      { from: 'n2',  to: 'n5',  label: '约束与目标' },
      { from: 'n5',  to: 'n6',  label: '简化模型' },
      { from: 'n6',  to: 'n7',  label: null },
      { from: 'n6',  to: 'n8',  label: null },
      { from: 'n6',  to: 'n9',  label: '算法结果' },
      { from: 'n9',  to: 'n10', label: '逆向求解' },
      { from: 'n10', to: 'n11', label: '得分结果' }
    ]
  },
  {
    file: 'case05-1-U-Net降水预报技术路线',
    category: 'A-技术路线图',
    title: 'case05 双偏振雷达 U-Net 降水预报 · 技术路线图',
    mainline: '雷达三变量 → 数据整定与过滤 → 阈值（35dBZ/256km²）筛选 → 三种微物理数据作为网络输入 → 三支并行编码 U-Net → 预警与精度评价',
    source: '流程图/case05-U-Net降水预报.md',
    containers: [
      { id: 'C1', title: '网络框架与训练', children: ['n7', 'n8'] }
    ],
    nodes: [
      { id: 'n1',  layer: 0,  lane: 0, type: 'start',    lines: ['双偏振雷达数据', 'Z_H、Z_DR、K_DP'] },
      { id: 'n2',  layer: 1,  lane: 0, type: 'step',     lines: ['数据整定与过滤', '剔除非强对流样本'] },
      { id: 'n3',  layer: 2,  lane: 0, type: 'decision', lines: ['达到 35dBZ', '与 256 km²'] },
      { id: 'n4',  layer: 3,  lane: 1, type: 'step',     lines: ['剔除该样本'] },
      { id: 'n5',  layer: 5,  lane: 0, type: 'step',     lines: ['三种微物理数据', '作为网络输入'] },
      { id: 'n6',  layer: 6,  lane: 0, type: 'step',     lines: ['网络框架与训练'] },
      { id: 'n7',  layer: 7,  lane: 0, type: 'step',     lines: ['① SE-BLOCK 三支并行编码'] },
      { id: 'n8',  layer: 8,  lane: 0, type: 'step',     lines: ['② 骨干 U-Net + Adam'] },
      { id: 'n9',  layer: 9,  lane: 0, type: 'step',     lines: ['强对流天气预警', '阈值筛选'] },
      { id: 'n10', layer: 10, lane: 0, type: 'focusend', lines: ['CSI、MAE、RMSE', '评价结果准确性'] }
    ],
    edges: [
      { from: 'n1', to: 'n2',  label: '三层观测' },
      { from: 'n2', to: 'n3',  label: '有效样本' },
      { from: 'n3', to: 'n4',  label: '否' },
      { from: 'n3', to: 'n5',  label: '是' },
      { from: 'n5', to: 'n6',  label: '三通道' },
      { from: 'n6', to: 'n7',  label: null },
      { from: 'n6', to: 'n8',  label: null },
      { from: 'n6', to: 'n9',  label: '预测场' },
      { from: 'n9', to: 'n10', label: '预警结果' }
    ]
  },
  {
    file: 'case06-1-全文技术路线图',
    category: 'A-技术路线图',
    title: 'case06 抗乳腺癌研究 · 全文技术路线图',
    mainline: '729 → 341 维 → 分步集成筛选（280 → 前 20 显著 → 137 维 → 集成筛选与验证）→ 分问题建模 → 问题四双目标转单目标与 PSO 定范围',
    source: '流程图/case06-抗乳腺癌全图.md',
    containers: [
      { id: 'C1', title: '分步集成筛选模型', children: ['n3', 'n4'] },
      { id: 'C2', title: '分问题建模', children: ['n7', 'n8', 'n9'] }
    ],
    nodes: [
      { id: 'n1',  layer: 0,  lane: 0, type: 'start',    lines: ['数据预处理', '729 → 341 维'] },
      { id: 'n2',  layer: 1,  lane: 0, type: 'step',     lines: ['分步集成筛选模型'] },
      { id: 'n3',  layer: 2,  lane: 0, type: 'step',     lines: ['① 去除类内冗余特征', '剩余 280 维'] },
      { id: 'n4',  layer: 3,  lane: 0, type: 'step',     lines: ['② 去类间冗余取前 20', '137 维 · 20 个显著'] },
      { id: 'n5',  layer: 4,  lane: 0, type: 'focus',    lines: ['集成式筛选与验证', '独立性与代表性'] },
      { id: 'n6',  layer: 5,  lane: 0, type: 'step',     lines: ['分问题建模'] },
      { id: 'n7',  layer: 6,  lane: 0, type: 'step',     lines: ['① 问题三分类建模', '深度随机森林与原型网络'] },
      { id: 'n8',  layer: 7,  lane: 0, type: 'step',     lines: ['② 问题二回归建模', 'Stacking 集成'] },
      { id: 'n9',  layer: 8,  lane: 0, type: 'step',     lines: ['③ 特征重要性分析', '模型交叉验证'] },
      { id: 'n10', layer: 9,  lane: 0, type: 'step',     lines: ['问题四 组合优化', '双目标转单目标'] },
      { id: 'n11', layer: 10, lane: 0, type: 'focusend', lines: ['PSO 确定搜索范围', '变量范围可视化分析'] }
    ],
    edges: [
      { from: 'n1',  to: 'n2',  label: '341 维' },
      { from: 'n2',  to: 'n3',  label: null },
      { from: 'n2',  to: 'n4',  label: null },
      { from: 'n2',  to: 'n5',  label: '137 维' },
      { from: 'n5',  to: 'n6',  label: '建模变量' },
      { from: 'n6',  to: 'n7',  label: null },
      { from: 'n6',  to: 'n8',  label: null },
      { from: 'n6',  to: 'n9',  label: null },
      { from: 'n6',  to: 'n10', label: '验证结论' },
      { from: 'n10', to: 'n11', label: '寻优结果' }
    ]
  },
  {
    file: 'case07-1-区域双碳预测技术路线',
    category: 'A-技术路线图',
    title: 'case07 区域双碳预测 · 技术路线图',
    mainline: '区域碳排放数据 → Kaya 恒等式四因子分解 → 参数预测（ARIMA-MLP 组合 / 回归模型对比）→ 多情景方案 → 区域碳达峰路径',
    source: '流程图/case07-区域双碳预测.md',
    containers: [
      { id: 'C1', title: 'Kaya 恒等式分解', children: ['n3', 'n4'] },
      { id: 'C2', title: '参数预测', children: ['n6', 'n7'] }
    ],
    nodes: [
      { id: 'n1', layer: 0, lane: 0, type: 'start',   lines: ['区域碳排放数据', 'Kaya 恒等式框架'] },
      { id: 'n2', layer: 1, lane: 0, type: 'step',    lines: ['Kaya 恒等式分解'] },
      { id: 'n3', layer: 2, lane: 0, type: 'step',    lines: ['① 人口 · 人均 GDP'] },
      { id: 'n4', layer: 3, lane: 0, type: 'step',    lines: ['② 单位 GDP 能耗', '单位能耗碳强度'] },
      { id: 'n5', layer: 4, lane: 0, type: 'step',    lines: ['参数预测'] },
      { id: 'n6', layer: 5, lane: 0, type: 'step',    lines: ['① 人口与 GDP', 'ARIMA-MLP 组合'] },
      { id: 'n7', layer: 6, lane: 0, type: 'step',    lines: ['② 能源消费量', '回归模型对比'] },
      { id: 'n8', layer: 7, lane: 0, type: 'step',    lines: ['多情景预测方案', '80% / 95% 区间 · 5 个方案'] },
      { id: 'n9', layer: 8, lane: 0, type: 'focusend', lines: ['区域碳达峰路径', '碳排放预测结果'] }
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '四因子分解' },
      { from: 'n2', to: 'n3', label: null },
      { from: 'n2', to: 'n4', label: null },
      { from: 'n2', to: 'n5', label: '参数需求' },
      { from: 'n5', to: 'n6', label: null },
      { from: 'n5', to: 'n7', label: null },
      { from: 'n5', to: 'n8', label: '预测序列' },
      { from: 'n8', to: 'n9', label: '代入恒等式' }
    ]
  },
  {
    file: 'case07-2-ARIMA-MLP组合预测',
    category: 'A-技术路线图',
    title: 'case07 双碳预测 · 人口与 GDP 的 ARIMA-MLP 组合模型（细节）',
    mainline: '历史序列 → ARIMA 处理线性部分、MLP 处理非线性残差 → 两部分预测值相加 → 人口与 GDP 预测',
    source: '流程图/case07-区域双碳预测.md',
    containers: [
      { id: 'C1', title: 'ARIMA-MLP 组合模型', children: ['n3', 'n4'] }
    ],
    nodes: [
      { id: 'n1', layer: 0, lane: 0, type: 'start',    lines: ['历史序列', '人口 / GDP'] },
      { id: 'n2', layer: 1, lane: 0, type: 'step',     lines: ['组合预测建模'] },
      { id: 'n3', layer: 2, lane: 0, type: 'step',     lines: ['① ARIMA 模型', '线性部分预测'] },
      { id: 'n4', layer: 3, lane: 0, type: 'step',     lines: ['② MLP 神经网络', '非线性残差预测'] },
      { id: 'n5', layer: 4, lane: 0, type: 'focus',    lines: ['两部分预测值相加', '组合预测结果'] },
      { id: 'n6', layer: 5, lane: 0, type: 'focusend', lines: ['人口与 GDP 预测', '未来数十年'] }
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '线性与残差' },
      { from: 'n2', to: 'n3', label: null },
      { from: 'n2', to: 'n4', label: null },
      { from: 'n2', to: 'n5', label: '组合' },
      { from: 'n5', to: 'n6', label: '提高精度' }
    ]
  },
  {
    file: 'case07-3-能耗回归模型对比',
    category: 'A-技术路线图',
    title: 'case07 双碳预测 · 能源消费量回归模型对比（细节）',
    mainline: '自变量共线性 → 二元多项式回归与降维后一元回归同时预测 → 对比同一年非化石能源能耗 → 与政策文件中的单位 GDP 能耗对比',
    source: '流程图/case07-区域双碳预测.md',
    containers: [
      { id: 'C1', title: '回归模型对比', children: ['n3', 'n4'] }
    ],
    nodes: [
      { id: 'n1', layer: 0, lane: 0, type: 'start',    lines: ['自变量共线性', '能源消费量预测'] },
      { id: 'n2', layer: 1, lane: 0, type: 'step',     lines: ['回归模型对比'] },
      { id: 'n3', layer: 2, lane: 0, type: 'step',     lines: ['① 二元多项式回归', '直接预测'] },
      { id: 'n4', layer: 3, lane: 0, type: 'step',     lines: ['② 降维后一元回归', '同期预测'] },
      { id: 'n5', layer: 4, lane: 0, type: 'focus',    lines: ['对比同一年预测结果', '非化石能源能耗'] },
      { id: 'n6', layer: 5, lane: 0, type: 'focusend', lines: ['与政策文件对比', '单位 GDP 能耗'] }
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '降维处理' },
      { from: 'n2', to: 'n3', label: null },
      { from: 'n2', to: 'n4', label: null },
      { from: 'n2', to: 'n5', label: '预测结果' },
      { from: 'n5', to: 'n6', label: '口径核对' }
    ]
  },

  /* ================= B 类：流程图 ================= */
  {
    file: 'case02-1-SVD压缩流程',
    category: 'B-流程图',
    title: 'case02 K 个矩阵的 SVD 压缩流程',
    mainline: 'K 个 M×N 矩阵 → 拆分重组（按行连接 1×MN、按行合并 K×MN）→ 奇异值分解 U/S/V → 设置提取秩 R 并保存 → 完成压缩',
    source: '流程图/case02-SVD矩阵压缩.md',
    containers: [
      { id: 'C1', title: '拆分重组', children: ['n3', 'n4'] }
    ],
    nodes: [
      { id: 'n1', layer: 0, lane: 0, type: 'start', lines: ['K 个 M×N 矩阵'] },
      { id: 'n2', layer: 1, lane: 0, type: 'step',  lines: ['拆分重组'] },
      { id: 'n3', layer: 2, lane: 0, type: 'step',  lines: ['① 按行连接', '得到 1×MN 行向量'] },
      { id: 'n4', layer: 3, lane: 0, type: 'step',  lines: ['② 按行合并', '得到 K×MN 大矩阵'] },
      { id: 'n5', layer: 4, lane: 0, type: 'focus', lines: ['奇异值分解 SVD', '得到 U、S、V'] },
      { id: 'n6', layer: 5, lane: 0, type: 'step',  lines: ['设置提取秩为 R'] },
      { id: 'n7', layer: 6, lane: 0, type: 'step',  lines: ['提取并保存', 'U/S/V 的前 R 项'] },
      { id: 'n8', layer: 7, lane: 0, type: 'end',   lines: ['完成压缩'] }
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '原始矩阵' },
      { from: 'n2', to: 'n3', label: null },
      { from: 'n2', to: 'n4', label: null },
      { from: 'n2', to: 'n5', label: 'K×MN 大矩阵' },
      { from: 'n5', to: 'n6', label: 'U、S、V' },
      { from: 'n6', to: 'n7', label: '秩 R' },
      { from: 'n7', to: 'n8', label: '截断数据' }
    ]
  },
  {
    file: 'case02-2-SVD恢复流程',
    category: 'B-流程图',
    title: 'case02 SVD 压缩结果的逆过程恢复流程',
    mainline: '压缩保留的 U_R/S_R/V_R → 逆过程拆分重组（按行拆分还原、重组为原始维度）→ 恢复原始矩阵',
    source: '流程图/case02-SVD矩阵压缩.md',
    containers: [
      { id: 'C1', title: '逆过程拆分重组', children: ['n3', 'n4'] }
    ],
    nodes: [
      { id: 'n1', layer: 0, lane: 0, type: 'start',    lines: ['压缩保留结果', 'U_R、S_R、V_R'] },
      { id: 'n2', layer: 1, lane: 0, type: 'step',     lines: ['逆过程拆分重组'] },
      { id: 'n3', layer: 2, lane: 0, type: 'step',     lines: ['① 按行拆分还原', '1×MN 行向量'] },
      { id: 'n4', layer: 3, lane: 0, type: 'step',     lines: ['② 重组为原始维度', '1×MN → M×N'] },
      { id: 'n5', layer: 4, lane: 0, type: 'focusend', lines: ['恢复原始矩阵'] }
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '低秩分量' },
      { from: 'n2', to: 'n3', label: null },
      { from: 'n2', to: 'n4', label: null },
      { from: 'n2', to: 'n5', label: '还原结果' }
    ]
  },
  {
    file: 'case03-1-Kmeans手肘法定K',
    category: 'B-流程图',
    title: 'case03 K-means 手肘法求解最优 K 值',
    mainline: 'K-means 聚类分析 → 手肘法三步（设 K 范围 / 跑 K-means 算 SSE / 画 SSE-K 曲线）→ 判定 SSE 下降速度是否减缓 → 该处即最优 K',
    source: '流程图/case03-Kmeans与随机森林.md',
    containers: [
      { id: 'C1', title: '手肘法求解最优 K', children: ['n3', 'n4', 'n5'] }
    ],
    nodes: [
      { id: 'n1', layer: 0, lane: 0, type: 'start',    lines: ['K-means 聚类分析'] },
      { id: 'n2', layer: 1, lane: 0, type: 'step',     lines: ['手肘法求解最优 K'] },
      { id: 'n3', layer: 2, lane: 0, type: 'step',     lines: ['① 设置 K 值范围', '1 ~ 10 等整数'] },
      { id: 'n4', layer: 3, lane: 0, type: 'step',     lines: ['② 运行 K-means 聚类', '计算 SSE'] },
      { id: 'n5', layer: 4, lane: 0, type: 'step',     lines: ['③ 可视化 SSE-K 曲线'] },
      { id: 'n6', layer: 5, lane: 0, type: 'decision', lines: ['SSE 下降速度减缓'] },
      { id: 'n7', layer: 6, lane: 1, type: 'step',     lines: ['继续增大 K 值'] },
      { id: 'n8', layer: 8, lane: 0, type: 'focusend', lines: ['该处即最优 K'] }
    ],
    edges: [
      { from: 'n1', to: 'n2', label: 'K 值待定' },
      { from: 'n2', to: 'n3', label: null },
      { from: 'n2', to: 'n4', label: null },
      { from: 'n2', to: 'n5', label: null },
      { from: 'n2', to: 'n6', label: '曲线形态' },
      { from: 'n6', to: 'n7', label: '否' },
      { from: 'n6', to: 'n8', label: '是' }
    ]
  },
  {
    file: 'case03-2-随机森林训练流程',
    category: 'B-流程图',
    title: 'case03 随机森林的训练流程',
    mainline: '原始样本集 → 判定是否到达 N 个训练子集（否：继续有放回抽样）→ 决策树独立训练（特征子空间抽特征 / 并行计算）→ 集成得到随机森林',
    source: '流程图/case03-Kmeans与随机森林.md',
    containers: [
      { id: 'C1', title: '决策树独立训练', children: ['n5', 'n6'] }
    ],
    nodes: [
      { id: 'n1', layer: 0, lane: 0, type: 'start',    lines: ['原始样本集'] },
      { id: 'n2', layer: 1, lane: 0, type: 'decision', lines: ['到达 N 个训练子集'] },
      { id: 'n3', layer: 2, lane: 1, type: 'step',     lines: ['Bagging 有放回抽样'] },
      { id: 'n4', layer: 4, lane: 0, type: 'step',     lines: ['决策树独立训练'] },
      { id: 'n5', layer: 5, lane: 0, type: 'step',     lines: ['① 特征子空间思想', '分支点随机抽特征'] },
      { id: 'n6', layer: 6, lane: 0, type: 'step',     lines: ['② 并行计算优化', '各决策树相互独立'] },
      { id: 'n7', layer: 7, lane: 0, type: 'focusend', lines: ['集成得到随机森林'] }
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '有放回抽样' },
      { from: 'n2', to: 'n3', label: '否' },
      { from: 'n2', to: 'n4', label: '是' },
      { from: 'n4', to: 'n5', label: null },
      { from: 'n4', to: 'n6', label: null },
      { from: 'n4', to: 'n7', label: '各树结果' }
    ]
  }
];
