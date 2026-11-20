import LegalPage, { type LegalSection } from "../components/LegalPage";

/** 《版权说明》全文 */
const SECTIONS: LegalSection[] = [
  {
    heading: "版权声明",
    paragraphs: [
      <>
        Copyright © 2026 修必达 FixIt AI。本产品的界面设计、源代码、图标、文案、文档以及"修必达 FixIt AI"名称与标识
        的相关权益，均归修必达 FixIt AI 运营团队所有，受《中华人民共和国著作权法》《中华人民共和国商标法》等法律、
        法规保护。
      </>,
      <>
        未经我们书面许可，任何单位或个人不得复制、转载、镜像、汇编本产品的页面内容与设计，不得将本产品的诊断建议、
        文档内容用于商业用途，不得使用与"修必达 FixIt AI"相同或近似的名称、标识从事容易引起混淆的活动。
      </>,
    ],
  },
  {
    heading: "开源组件致谢",
    paragraphs: [
      <>
        本产品前端部分基于以下开源项目构建，感谢开源社区的贡献。各项目遵循其对应的开源许可协议：
      </>,
      <>
        1. <strong>React 与 React DOM</strong>（MIT License）— 用户界面框架；2. <strong>React Router</strong>（MIT
        License）— 页面路由；3. <strong>Zustand</strong>（MIT License）— 前端状态管理；4.{" "}
        <strong>Zod</strong>（MIT License）— 数据校验；5. <strong>Tailwind CSS</strong>（MIT License）— 界面样式系统
        ；6. <strong>Vite</strong>（MIT License）— 构建工具；7. <strong>lucide-react</strong>（ISC License）— 界面图
        标库。
      </>,
      <>
        上述开源项目的版权归其各自的作者或权利人所有。如需了解完整的依赖与许可信息，可查看本产品的源代码仓库依赖清
        单（package.json）。
      </>,
    ],
  },
  {
    heading: "用户内容授权",
    paragraphs: [
      <>
        你在本产品中填写的设备信息、故障描述、上传的故障照片、维修记录等内容，其知识产权归你所有。
      </>,
      <>
        为了向你提供诊断、报修与档案服务，你授予我们一项<strong>非独占的、免费的使用许可</strong>，仅限于在提供本产
        品服务所必需的范围内存储、处理、展示上述内容，并在你发起看图诊断时将照片转发至视觉大模型。除《隐私政策》约
        定的 AI 诊断处理场景外，我们不会将你的内容用于模型训练、广告或其他任何商业用途；你删除相关记录后，许可范围
        随之终止。
      </>,
    ],
  },
  {
    heading: "第三方服务说明",
    paragraphs: [
      <>
        本产品的 AI 诊断功能接入了智谱（Zhipu AI）GLM 大模型服务。"智谱""GLM"及其相关名称与标识归北京智谱华章科技
        有限公司所有，本产品的使用行为不代表对其名称与商标的任何权利主张。诊断建议由该模型生成，其生成内容的版权与
        责任归属遵循智谱开放平台的相关服务协议。
      </>,
    ],
  },
  {
    heading: "侵权投诉",
    paragraphs: [
      <>
        若你认为本产品中的任何内容侵犯了你的著作权或其他合法权益，请通过产品反馈邮箱 support@fixitai.cn 向我们提
        出投诉，并提供：权利人身份证明、权利证明材料、涉嫌侵权的具体内容与位置说明。我们将在核实后 15 个工作日内
        依法处理并予以回复。
      </>,
    ],
  },
];

/** 版权说明页 */
export default function CopyrightInfo() {
  return (
    <LegalPage
      title="版权说明"
      subtitle="修必达 FixIt AI 的版权声明、开源致谢与侵权投诉渠道"
      effectiveDate="2026年11月19日"
      sections={SECTIONS}
    />
  );
}
