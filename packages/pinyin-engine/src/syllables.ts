/**
 * 现代标准汉语（普通话）全部合法拼音音节表 —— 预览引擎拼音内核的地基。
 *
 * 设计要点：
 * - 这里存的是**用户实际敲出来的 ASCII 形式**（键盘只有 a-z），因此 ü 一律以 `v` 记：
 *   lü→`lv`、nü→`nv`、lüe→`lve`、nüe→`nve`；而 ju/qu/xu/yu 本就写作 u，保持不变。
 * - 音节集合是固定的语言学事实（约 410 个无调音节），可用回归测试锁定；覆盖率问题
 *   （生僻/覆盖不足）属词库层，不属音节层（见架构 §11.3）。
 * - 同时导出「前缀集合」：一个字符串若是某合法音节的真前缀，说明用户可能还在往下敲，
 *   增量输入与分词的"未完成尾巴"判定都依赖它。
 */

// 按声母分组书写，便于人工核对。全部为无声调的"可敲入"形式。
const SYLLABLE_GROUPS: Record<string, string> = {
  // 零声母（a/o/e 起头）
  _: "a ai an ang ao e ei en eng er o ou",
  b: "ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu",
  p: "pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu",
  m: "ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu",
  f: "fa fan fang fei fen feng fo fou fu",
  d: "da dai dan dang dao de dei den deng di dian diao die ding diu dong dou du duan dui dun duo",
  t: "ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo",
  n: "na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nv nve",
  l: "la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo lv lve",
  g: "ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo",
  k: "ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo",
  h: "ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo",
  j: "ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun",
  q: "qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun",
  x: "xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun",
  zh: "zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo",
  ch: "cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo",
  sh: "sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo",
  r: "ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo",
  z: "za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo",
  c: "ca cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo",
  s: "sa sai san sang sao se sen seng si song sou su suan sui sun suo",
  y: "ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun",
  w: "wa wai wan wang wei wen weng wo wu",
};

/** 全部合法音节（可敲入 ASCII 形式）。 */
export const SYLLABLES: ReadonlySet<string> = new Set(
  Object.values(SYLLABLE_GROUPS)
    .flatMap((line) => line.split(/\s+/))
    .filter(Boolean),
);

/** 最长音节长度（zhuang/chuang/shuang = 6），分词 DP 的回看窗口上界。 */
export const MAX_SYLLABLE_LEN = 6;

/** 全部合法音节的「真前缀」集合（不含音节本身之外的空串处理见下）。 */
export const SYLLABLE_PREFIXES: ReadonlySet<string> = (() => {
  const prefixes = new Set<string>();
  for (const syl of SYLLABLES) {
    for (let i = 1; i < syl.length; i++) {
      prefixes.add(syl.slice(0, i));
    }
  }
  return prefixes;
})();

/** 是否是完整合法音节。 */
export function isSyllable(s: string): boolean {
  return SYLLABLES.has(s);
}

/**
 * 该串能否成为某个音节（本身是合法音节，或是某合法音节的真前缀）。
 * 用于增量输入时判断"用户还能不能接着往下敲成一个合法音节"。
 */
export function isSyllablePrefix(s: string): boolean {
  return s.length === 0 || SYLLABLES.has(s) || SYLLABLE_PREFIXES.has(s);
}
