import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  Copy,
  ExternalLink,
  Phone,
  ShieldAlert,
} from "lucide-react";

import Button, { buttonClass } from "../components/Button";
import Chip from "../components/Chip";
import ErrorBanner from "../components/ErrorBanner";
import InputField from "../components/InputField";
import Loading from "../components/Loading";
import ModalDialog from "../components/ModalDialog";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import {
  ApiError,
  listHotlines,
  type HotlineDirectory,
  type HotlineRecord,
} from "../services/api";
import { DEVICE_IMAGES } from "../utils/deviceImages";

/** 主入口：与首页设备分类保持一致（空调 / 冰箱 / 洗衣机 / 其他家电） */
const MAIN_CATEGORIES = [
  {
    key: "ac",
    label: "空调",
    categories: ["空调", "中央空调"],
  },
  {
    key: "fridge",
    label: "冰箱",
    categories: ["冰箱冷柜"],
  },
  {
    key: "washer",
    label: "洗衣机",
    categories: ["洗衣干衣", "衣物护理"],
  },
  {
    key: "other",
    label: "其他家电",
    categories: [
      "电视影音",
      "热水采暖",
      "厨房电器",
      "净水饮水",
      "生活小电",
      "个护电器",
      "清洁电器",
      "空气处理",
      "咖啡电器",
    ],
  },
] as const;

type MainKey = (typeof MAIN_CATEGORIES)[number]["key"];

/** 「其他家电」二级细分（只作为检索导航，不代表品牌确认承修全部型号） */
const OTHER_GROUPS = [
  { key: "tv", label: "电视影音", categories: ["电视影音"] },
  { key: "kitchen", label: "厨房", categories: ["厨房电器", "咖啡电器"] },
  { key: "hotwater", label: "热水", categories: ["热水采暖"] },
  { key: "water", label: "净水", categories: ["净水饮水"] },
  { key: "clean", label: "清洁", categories: ["清洁电器", "空气处理"] },
  { key: "small", label: "生活小电", categories: ["生活小电", "个护电器"] },
] as const;

/** 品类展示文案：把内部检索分类翻译成用户熟悉的说法 */
const CATEGORY_DISPLAY: Record<string, string> = {
  空调: "空调",
  中央空调: "中央空调",
  冰箱冷柜: "冰箱、冷柜",
  洗衣干衣: "洗衣机、干衣机",
  衣物护理: "衣物护理机",
  电视影音: "电视、影音设备",
  热水采暖: "热水器、采暖设备",
  厨房电器: "厨房电器",
  净水饮水: "净水器、饮水机",
  生活小电: "生活小家电",
  个护电器: "个护电器",
  清洁电器: "清洁电器",
  空气处理: "空气净化",
  咖啡电器: "咖啡机",
};

/** 品类展示最多 5 项，超出用“等”收尾，避免把复制按钮挤到下一行 */
const MAX_CATEGORY_ITEMS = 5;

function categoryText(categories: string[]): string {
  const items = categories.flatMap((c) =>
    (CATEGORY_DISPLAY[c] ?? c).split("、")
  );
  if (items.length <= MAX_CATEGORY_ITEMS) return items.join("、");
  return `${items.slice(0, MAX_CATEGORY_ITEMS).join("、")}等`;
}

/** 与数据包 lookup.mjs 一致：NFKC、去空白与常见分隔符后精确匹配，避免三菱重工/三菱电机混用 */
function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s.·’'_-]/g, "");
}

function matchesBrand(record: HotlineRecord, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return [record.brand_group, record.brand, ...record.aliases].some(
    (name) => normalize(name) === q
  );
}

function inCategories(record: HotlineRecord, categories: readonly string[]): boolean {
  return record.categories.some((c) => categories.includes(c));
}

function ContactRow({
  record,
  isTouch,
  onShowSource,
}: {
  record: HotlineRecord;
  isTouch: boolean;
  onShowSource: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(record.phone);
      setCopied(true);
      setCopyFailed(false);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-900">
            {record.brand}
            <span className="ml-2 text-xs font-normal text-stone-400">
              {categoryText(record.categories)}
            </span>
          </p>
          <p className="mt-1 break-all text-xl font-bold tracking-wide text-brand-800">
            {record.phone}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {isTouch ? (
            <a
              href={record.phone_uri}
              className={`${buttonClass("primary", "md")} shrink-0`}
              aria-label={`拨打${record.brand}官方售后电话 ${record.phone}`}
            >
              <Phone aria-hidden className="h-4 w-4" />
              拨打官方售后
            </a>
          ) : (
            <Button
              size="md"
              onClick={copyPhone}
              aria-label={`复制${record.brand}官方售后电话 ${record.phone}`}
            >
              {copied ? (
                <Check aria-hidden className="h-4 w-4" />
              ) : (
                <Copy aria-hidden className="h-4 w-4" />
              )}
              {copied ? "已复制" : "复制号码"}
            </Button>
          )}

          {isTouch && (
            <button
              type="button"
              onClick={copyPhone}
              className="inline-flex items-center gap-1 text-[11px] text-stone-500 hover:text-brand-700"
            >
              {copied ? (
                <Check aria-hidden className="h-3 w-3" />
              ) : (
                <Copy aria-hidden className="h-3 w-3" />
              )}
              {copied ? "已复制" : "复制号码"}
            </button>
          )}
        </div>
      </div>

      {copyFailed && (
        <p role="status" className="mt-1 text-right text-xs text-red-600">
          复制失败，请手动输入上方号码
        </p>
      )}

      {record.notes && (
        <p className="mt-2 text-xs leading-relaxed text-stone-500">{record.notes}</p>
      )}

      <div className="mt-2 text-xs text-stone-500">
        服务时间：{record.hours ?? "请以官方回复为准"}
      </div>

      {record.source_url && (
        <button
          type="button"
          onClick={onShowSource}
          className="mt-2 inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
        >
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          官方来源
        </button>
      )}

      {record.review_due && (
        <p
          role="note"
          className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          已超过建议复核日期（{record.next_review_on}），号码可能已调整，请以品牌官方页面为准。
        </p>
      )}
    </div>
  );
}

/** 官方售后电话查询：按品牌 → 家电类型查询，只展示可展示记录，不代用户报修 */
export default function Hotlines() {
  const [data, setData] = useState<HotlineDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceRecord, setSourceRecord] = useState<HotlineRecord | null>(null);

  const [mainKey, setMainKey] = useState<MainKey | "">("");
  const [subKey, setSubKey] = useState<string>("");
  const [query, setQuery] = useState("");
  /** 触屏设备保留一键拨号；鼠标/电脑端改为复制号码，避免 tel 链接变成摆设 */
  const [isTouch] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(pointer: coarse)").matches ||
        navigator.maxTouchPoints > 0)
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listHotlines()
      .then((payload) => {
        if (alive) setData(payload);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : "售后电话目录读取失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const categoryFilter = useMemo<readonly string[] | null>(() => {
    if (mainKey === "other" && subKey) {
      return OTHER_GROUPS.find((g) => g.key === subKey)?.categories ?? null;
    }
    if (mainKey) {
      return MAIN_CATEGORIES.find((c) => c.key === mainKey)?.categories ?? null;
    }
    return null;
  }, [mainKey, subKey]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.records.filter(
      (record) =>
        matchesBrand(record, query) &&
        (!categoryFilter || inCategories(record, categoryFilter))
    );
  }, [data, query, categoryFilter]);

  /** 品牌分组展示；同一品牌多服务体系（如东芝）并列，不按电话号码合并 */
  const groups = useMemo(() => {
    const grouped = new Map<string, HotlineRecord[]>();
    for (const record of filtered) {
      const list = grouped.get(record.brand_group) ?? [];
      list.push(record);
      grouped.set(record.brand_group, list);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) =>
      a.localeCompare(b, "zh-CN")
    );
  }, [filtered]);

  /** 搜索词对应的品牌是否存在（用于区分“品牌未收录”与“当前分类无产品线”） */
  const brandExists = useMemo(() => {
    if (!data || !query.trim()) return false;
    return data.records.some((record) => matchesBrand(record, query));
  }, [data, query]);

  function selectMain(key: MainKey) {
    setMainKey((current) => (current === key ? "" : key));
    setSubKey("");
  }

  function clearFilters() {
    setMainKey("");
    setSubKey("");
    setQuery("");
  }

  const activeMain = MAIN_CATEGORIES.find((c) => c.key === mainKey);
  const activeSub = OTHER_GROUPS.find((g) => g.key === subKey);

  if (loading) {
    return <Loading label="正在读取官方售后电话目录…" />;
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="官方售后电话查询"
          subtitle="品牌官网公布 · 未拨测"
          titleClassName="font-body"
        />
        <ErrorBanner message={error ?? "售后电话目录读取失败"} onRetry={() => setReloadKey((n) => n + 1)} />
        <Link to="/" className="text-sm text-brand-700 hover:underline">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="官方售后电话查询" titleClassName="font-body" />

      {/* 主入口：空调 / 冰箱 / 洗衣机 / 其他家电 */}
      <section aria-labelledby="hotline-categories">
        <h2 id="hotline-categories" className="mb-3 text-[15px] font-semibold text-stone-800">
          按家电类型查找
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {MAIN_CATEGORIES.map((item) => {
            const selected = mainKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected}
                onClick={() => selectMain(item.key)}
                className={[
                  "flex min-h-[72px] items-center gap-2.5 rounded-2xl border p-2.5 text-left shadow-card transition-colors sm:gap-3 sm:p-3",
                  selected
                    ? "border-brand-500 bg-brand-100"
                    : "border-stone-200 bg-surface hover:border-brand-400 hover:bg-brand-100",
                ].join(" ")}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center sm:h-11 sm:w-11">
                  <img
                    src={DEVICE_IMAGES[item.key].src}
                    alt={DEVICE_IMAGES[item.key].alt}
                    className="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(28,25,23,0.22)]"
                  />
                </span>
                <span className="whitespace-nowrap text-[13px] font-semibold text-stone-800 sm:text-sm">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {mainKey === "other" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip selected={!subKey} onClick={() => setSubKey("")}>
              全部其他家电
            </Chip>
            {OTHER_GROUPS.map((group) => (
              <Chip
                key={group.key}
                selected={subKey === group.key}
                onClick={() => setSubKey(group.key)}
              >
                {group.label}
              </Chip>
            ))}
          </div>
        )}
      </section>

      {/* 品牌搜索：中文品牌、英文名与别名精确匹配 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <InputField
            mode="search"
            label="搜索品牌"
            inputClassName="bg-surface"
            placeholder="输入品牌，如 海尔、Haier、卡萨帝"
            value={query}
            onChange={setQuery}
          />
        </div>
        {(mainKey || subKey || query) && (
          <Button variant="secondary" onClick={clearFilters}>
            清除筛选
          </Button>
        )}
      </div>

      {/* 结果 */}
      <SectionCard
        title={
          activeMain
            ? `${activeMain.label}${activeSub ? ` · ${activeSub.label}` : ""}`
            : "全部品牌"
        }
        padding="none"
      >
        {groups.length === 0 ? (
          <div className="p-4">
            <div className="rounded-2xl border border-dashed border-stone-300 bg-surface px-4 py-10 text-center">
              <p className="text-sm font-medium text-stone-500">
                {brandExists
                  ? "该品牌在当前分类下暂无对应产品线"
                  : "暂未收录该品牌的官方售后电话"}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {groups.map(([brandGroup, records]) => (
              <article key={brandGroup} className="p-4">
                <div className="space-y-2">
                  {records.map((record) => (
                    <div
                      key={record.id}
                      className="rounded-xl border border-stone-200 bg-stone-50/40"
                    >
                      <ContactRow
                        record={record}
                        isTouch={isTouch}
                        onShowSource={() => setSourceRecord(record)}
                      />
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <p className="flex items-start gap-2 rounded-2xl border border-risk-medium-border bg-risk-medium-bg p-4 text-sm text-risk-medium-deep">
        <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-risk-medium" />
        <span>
          如出现冒烟、焦糊气味或疑似漏电，请立即停止使用并断电，直接联系专业人员；
          报修前可先在
          <Link to="/repair" className="mx-1 font-semibold underline">
            智能报修
          </Link>
          整理故障话术。
        </span>
      </p>

      <ModalDialog
        open={sourceRecord !== null}
        title={sourceRecord ? `${sourceRecord.brand} · 官方来源` : "官方来源"}
        description="在本页查看来源地址；如需访问品牌官网，将新开标签页，不会离开当前页面。"
        onClose={() => setSourceRecord(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSourceRecord(null)}>
              返回售后电话
            </Button>
            {sourceRecord?.source_url && (
              <a
                href={sourceRecord.source_url}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("primary", "md")}
              >
                在新标签页打开
                <ExternalLink aria-hidden className="h-4 w-4" />
              </a>
            )}
          </>
        }
      >
        {sourceRecord?.source_url && (
          <p className="break-all rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
            {sourceRecord.source_url}
          </p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-stone-500">
          来源地址为核验时品牌官方页面，官方页面可能包含动态内容或访问限制。
        </p>
      </ModalDialog>
    </div>
  );
}
