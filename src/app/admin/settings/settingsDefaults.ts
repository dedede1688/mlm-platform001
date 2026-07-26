// ---- 默认 HTML 兜底函数 ----

export function getDefaultAboutHtml(): string {
  return `
    <h2>公司简介</h2>
    <p>敏维生物科技有限公司专注于金花菌（冠突散囊菌）的深度研发与产业化应用，是一家集科研、生产、销售于一体的现代化生物科技企业。公司依托独有的金花菌耐高温专利技术，成功突破了金花菌在121℃高温下仍能存活的行业难题，为降血脂、调节肠道菌群等健康领域带来了革命性突破。</p>
    <p>公司核心产品金花红茶，采用传统红茶工艺与金花菌发酵技术相结合，使每克茶叶含有数以亿计的活性金花菌，为消费者提供日常便捷的健康养生方案。</p>

    <h2>科研实力</h2>
    <p>公司拥有一支由中国科学院博士领衔的顶尖研发团队，核心科研人员在金花菌领域深耕超过13年，累计获得多项国家发明专利。团队在菌种选育、发酵工艺优化、功效验证等方面积累了丰富的技术储备，为产品的科学性和有效性提供了坚实保障。</p>
    <ul>
      <li>中国科学院博士领衔研发团队</li>
      <li>13年金花菌专注研究经验</li>
      <li>多项国家发明专利授权</li>
      <li>完整的菌种选育与发酵工艺体系</li>
    </ul>

    <h2>企业文化</h2>
    <h3>使命</h3>
    <p>以科技创新赋能健康生活，让金花菌的益处惠及每一个人。</p>
    <h3>愿景</h3>
    <p>成为全球金花菌研发与应用的领军企业，推动传统茶饮与现代生物科技的深度融合。</p>
    <h3>价值观</h3>
    <p>科学严谨 · 诚信务实 · 创新驱动 · 合作共赢</p>
  `
}

export function getDefaultTermsHtml(): string {
  return `
    <h2>用户协议</h2>
    <p>欢迎使用敏维科技健康商城（以下简称"本平台"）。在您注册成为本平台会员或使用本平台服务之前，请仔细阅读以下条款。</p>

    <h3>一、服务说明</h3>
    <p>本平台是一个综合电商平台，为用户提供优质健康产品的在线购买服务。平台保留随时修改或中断服务的权利。</p>

    <h3>二、账户注册</h3>
    <ul>
      <li>注册时请提供真实、准确、完整的个人信息</li>
      <li>用户有责任妥善保管账户密码</li>
      <li>每个用户只能注册一个账户</li>
      <li>禁止冒用他人身份注册</li>
    </ul>

    <h3>三、订单与支付</h3>
    <ul>
      <li>商品价格以结算时为准</li>
      <li>支付完成后系统将自动生成订单</li>
      <li>部分商品支持7天无理由退货（具体以商品页面说明为准）</li>
    </ul>

    <h3>四、分销规则</h3>
    <ul>
      <li>用户可通过分享专属链接获得分销佣金</li>
      <li>佣金比例由平台根据产品类别设定</li>
      <li>严禁通过虚假交易等违规方式获取佣金</li>
    </ul>

    <h3>五、隐私保护</h3>
    <p>我们重视您的隐私保护，将按照《隐私政策》的规定收集、使用和保护您的个人信息。</p>

    <h3>六、免责声明</h3>
    <ul>
      <li>本平台不对因不可抗力导致的服务中断承担责任</li>
      <li>用户应自行承担使用本平台服务的风险</li>
      <li>第三方提供的内容和服务由其自行负责</li>
    </ul>

    <h3>七、协议更新</h3>
    <p>本平台有权随时修改本协议内容。修改后的协议将在平台上公布，继续使用即表示同意修改后的协议。</p>

    <p class="text-sm text-gray-500 mt-4">最后更新：2026年6月</p>
  `
}

export function getDefaultPrivacyHtml(): string {
  return `
    <h2>隐私政策</h2>
    <p>我们（"敏维科技"、"本平台"）深知个人信息对您的重要性，我们将按照相关法律法规的要求，采取相应的安全保护措施来保护您的个人信息。</p>

    <h3>一、信息收集</h3>
    <ul>
      <li>当您注册账户时，我们会收集您的手机号、昵称等基本信息</li>
      <li>当您下单购买商品时，我们会收集收货人姓名、地址、联系方式等信息</li>
      <li>为了改善服务质量，我们可能会自动收集您的设备信息、浏览记录等技术数据</li>
    </ul>

    <h3>二、信息使用</h3>
    <p>我们收集的信息将用于以下目的：</p>
    <ul>
      <li>创建和管理您的账户</li>
      <li>处理和配送您的订单</li>
      <li>提供客户服务和技术支持</li>
      <li>发送订单状态、促销活动等相关通知</li>
      <li>改进我们的产品和服务质量</li>
    </ul>

    <h3>三、信息共享</h3>
    <p>除以下情况外，我们不会与第三方共享您的个人信息：</p>
    <ul>
      <li>获得您的明确同意或授权</li>
      <li>法律法规要求披露</li>
      <li>与可信赖的合作伙伴（如物流服务商、支付机构）为完成交易必要</li>
    </ul>

    <h3>四、信息安全</h3>
    <p>我们采用业界标准的安全技术和管理措施来保护您的个人信息，包括但不限于：</p>
    <ul>
      <li>数据传输加密（SSL/TLS）</li>
      <li>数据库访问权限控制</li>
      <li>定期安全审计和漏洞扫描</li>
      <li>员工隐私培训</li>
    </ul>

    <h3>五、Cookie 使用</h3>
    <p>本平台可能使用 Cookie 和类似技术来：</p>
    <ul>
      <li>记住您的登录状态和偏好设置</li>
      <li>分析网站流量和使用情况</li>
      <li>提供个性化内容和推荐</li>
    </ul>
    <p>您可以通过浏览器设置管理或删除 Cookie。禁用 Cookie 可能会影响部分功能的使用。</p>

    <h3>六、信息存储期限</h3>
    <p>我们只会在实现本政策所述目的所必需的期限内保留您的个人信息。超过该期限后，我们将安全地删除或匿名化处理您的数据。</p>

    <h3>七、您的权利</h3>
    <p>根据适用法律法规，您可能享有以下权利：</p>
    <ul>
      <li>访问、更正或删除您的个人信息</li>
      <li>撤回之前给予的同意</li>
      <li>注销账户</li>
      <li>投诉或举报数据处理行为</li>
    </ul>

    <h3>八、未成年人保护</h3>
    <p>本平台主要面向成年人。如果您是未满18周岁的未成年人，请在监护人的指导下使用本平台服务。我们不会故意收集未成年人的个人信息。</p>

    <h3>九、政策更新</h3>
    <p>我们可能会不时更新本隐私政策。重大变更将通过平台公告或邮件通知您。继续使用即表示同意更新后的政策。</p>

    <p class="text-sm text-gray-500 mt-4">最后更新：2026年6月</p>
  `
}

export function getDefaultHelpFaq(): Array<{ question: string; answer: string }> {
  return [
    {
      question: '如何注册成为会员？',
      answer: '点击右上角"注册"按钮，填写手机号和验证码即可完成注册。注册成功后即可登录并享受会员权益。',
    },
    {
      question: '什么是推荐奖和品牌管理奖？',
      answer: '推荐奖：直接推荐用户消费获得的奖励（推荐人需买过 ≥1 件升级品才发放）。品牌管理奖：安置链内经销商按购买单数轮换获得，含层数上限（主任 2 层 / 经理 4 层 / 总监 10 层），无对应经销商时金额沉淀不发放。两种奖励均可提现或抵扣消费。',
    },
    {
      question: '如何升级为经销商？',
      answer: '累计推荐满 XX 人且自购消费满 XX 元后，可申请升级为经销商。经销商享受更高的佣金比例和团队管理权限。具体条件请联系客服咨询。',
    },
    {
      question: '积分如何使用？',
      answer: '在购物时可使用积分抵扣，1 积分 = 1 元，每件商品有最高抵扣比例（通常 50%）。积分也可转赠其他会员。积分有效期一般为获得之日起 1 年内有效。',
    },
    {
      question: '如何联系客服？',
      answer: '客服微信：xxx（请后台设置） | 工作时间：周一至周日 9:00-21:00 | 客服热线：18566793066',
    },
  ]
}

interface FaqItem {
  question: string
  answer: string
}

export interface BannerItem {
  imageUrl: string
  link?: string
  title?: string
}

export interface SettingsData {
  siteName: string
  logoUrl: string
  contactPhone: string
  serviceEmail: string
  serviceTime: string
  companyName: string
  companyAddress: string
  icp: string
  copyright: string
  aboutUs: string
  termsHtml: string
  privacyHtml: string
  helpFaq: FaqItem[]
  banners: BannerItem[]
  seoTitle: string
  seoDescription: string
  seoKeywords: string
  paymentProvider: string
  paymentMerchantId: string
  paymentSecret: string
  paymentNotifyUrl: string
}

export const defaultSettings: SettingsData = {
  siteName: '敏维科技',
  logoUrl: '/logo.png',
  contactPhone: '18566793066',
  serviceEmail: '381901944@qq.com',
  serviceTime: '周一至周日 9:00-21:00',
  companyName: '广州敏维科技有限公司',
  companyAddress: '广州市花都区金谷南路',
  icp: '粤ICP备XXXXXXXX号',
  copyright: '2026',
  aboutUs: '',
  termsHtml: '',
  privacyHtml: '',
  helpFaq: [],
  banners: [],
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '',
  paymentProvider: 'mock',
  paymentMerchantId: '',
  paymentSecret: '',
  paymentNotifyUrl: '',
}

export const fieldConfig: { key: keyof SettingsData; label: string; type?: string }[] = [
  { key: 'siteName', label: '网站名称' },
  { key: 'logoUrl', label: 'Logo 网址' },
  { key: 'contactPhone', label: '联系电话' },
  { key: 'serviceEmail', label: '客服邮箱', type: 'email' },
  { key: 'serviceTime', label: '服务时间' },
  { key: 'companyName', label: '公司名称' },
  { key: 'companyAddress', label: '公司地址' },
  { key: 'icp', label: 'ICP备案号' },
  { key: 'copyright', label: '版权年份' },
]

