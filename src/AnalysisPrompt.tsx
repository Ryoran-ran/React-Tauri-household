import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { buildAnalysisPrompt } from "./promptBuilder";
import { localDate, monthRange } from "./finance";
import {
  inAnalysisRange,
  resolveAnalysisPeriod,
  type AnalysisPeriod,
} from "./analysisPeriod";
import type { Snapshot } from "./types";

export default function AnalysisPrompt({
  data,
  month,
  onMonth,
}: {
  data: Snapshot;
  month: string;
  onMonth: (value: string) => void;
}) {
  const [comparePrevious, setComparePrevious] = useState(true);
  const [periodType, setPeriodType] = useState<AnalysisPeriod["type"]>("month");
  const [year, setYear] = useState(month.slice(0, 4));
  const [quarter, setQuarter] = useState(
    Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1,
  );
  const [from, setFrom] = useState(monthRange(month).from);
  const [to, setTo] = useState(monthRange(month).to);
  const period = useMemo<AnalysisPeriod>(() => {
    if (periodType === "month") return { type: "month", month };
    if (periodType === "custom") return { type: "custom", from, to };
    if (periodType === "quarter")
      return { type: "quarter", year: Number(year), quarter };
    return { type: "year", year: Number(year) };
  }, [periodType, month, year, quarter, from, to]);
  const range = resolveAnalysisPeriod(period);
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [includeDetails, setIncludeDetails] = useState(false);
  const [includeMemos, setIncludeMemos] = useState(false);
  const [includePaymentMethods, setIncludePaymentMethods] = useState(false);
  const [question, setQuestion] = useState("");
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [copying, setCopying] = useState(false);
  const preview = useRef<HTMLTextAreaElement>(null);
  const today = localDate();
  const prompt = useMemo(
    () =>
      buildAnalysisPrompt(
        data,
        {
          period,
          comparePrevious,
          includeDrafts,
          includeDetails,
          includeMemos,
          includePaymentMethods,
          question,
        },
        today,
      ),
    [
      data,
      period,
      comparePrevious,
      includeDrafts,
      includeDetails,
      includeMemos,
      includePaymentMethods,
      question,
      today,
    ],
  );
  const entries = range.current
    ? data.entries.filter((entry) =>
        inAnalysisRange(entry.date, range.current!),
      )
    : [];
  const confirmed = entries.filter(
    (entry) => entry.status === "confirmed",
  ).length;
  const drafts = entries.length - confirmed;
  const hasData = confirmed + (includeDrafts ? drafts : 0) > 0;
  useEffect(() => {
    setMessage("");
  }, [prompt]);
  async function copy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("コピーしました。利用するAIの入力欄に貼り付けてください。");
    } catch {
      preview.current?.focus();
      preview.current?.select();
      setMessage(
        "自動コピーができませんでした。選択した本文を Ctrl+C でコピーしてください。",
      );
    } finally {
      setCopying(false);
    }
  }
  return (
    <div className="page-content analysis-page">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>分析してもらう内容を選ぶ</h2>
            <p>
              家計簿から依頼文と集計データを作ります。AIへの送信は行いません。
            </p>
          </div>
          <Sparkles size={22} />
        </div>
        <div className="analysis-options">
          <div className="analysis-range-controls">
            <label className="field">
              分析する範囲
              <select
                aria-label="分析する範囲"
                value={periodType}
                onChange={(e) =>
                  setPeriodType(e.target.value as AnalysisPeriod["type"])
                }
              >
                <option value="month">月ごと</option>
                <option value="quarter">四半期</option>
                <option value="year">年間</option>
                <option value="custom">任意の期間</option>
              </select>
            </label>
            {periodType === "month" && (
              <label className="field">
                分析する月
                <input
                  type="month"
                  aria-label="分析する月"
                  min="1900-01"
                  max="9999-12"
                  value={month}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (
                      /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
                      value >= "1900-01"
                    ) {
                      onMonth(value);
                      setYear(value.slice(0, 4));
                      setQuarter(
                        Math.floor((Number(value.slice(5, 7)) - 1) / 3) + 1,
                      );
                    }
                  }}
                />
              </label>
            )}
            {(periodType === "year" || periodType === "quarter") && (
              <label className="field">
                分析する年
                <input
                  aria-label="分析する年"
                  type="number"
                  min="1900"
                  max="9999"
                  step="1"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </label>
            )}
            {periodType === "quarter" && (
              <label className="field">
                分析する四半期
                <select
                  aria-label="分析する四半期"
                  value={quarter}
                  onChange={(e) => setQuarter(Number(e.target.value))}
                >
                  <option value={1}>第1四半期（1〜3月）</option>
                  <option value={2}>第2四半期（4〜6月）</option>
                  <option value={3}>第3四半期（7〜9月）</option>
                  <option value={4}>第4四半期（10〜12月）</option>
                </select>
              </label>
            )}
            {periodType === "custom" && (
              <>
                <label className="field">
                  分析開始日
                  <input
                    aria-label="分析開始日"
                    type="date"
                    min="1900-01-01"
                    max="9999-12-31"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="field">
                  分析終了日
                  <input
                    aria-label="分析終了日"
                    type="date"
                    min="1900-01-01"
                    max="9999-12-31"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
          {range.error && (
            <p role="alert" className="error-message">
              {range.error}
            </p>
          )}
          {range.current && (
            <p className="analysis-note" data-testid="analysis-period">
              集計期間：{range.current.from} 〜 {range.current.to}
              {periodType === "year" && "（1〜12月）"}
            </p>
          )}
          <p className="analysis-count">
            対象期間：確定 {confirmed} 件・仮入力 {drafts} 件
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={comparePrevious && Boolean(range.previous)}
              disabled={!range.previous}
              onChange={(e) => setComparePrevious(e.target.checked)}
            />
            {range.comparisonLabel}との比較を含める
          </label>
          {comparePrevious && range.previous && (
            <p className="analysis-note" data-testid="analysis-comparison">
              比較期間：{range.previous.from} 〜 {range.previous.to}
            </p>
          )}
          {range.current && !range.previous && (
            <p className="analysis-note">
              比較期間が1900年より前になるため、比較は含めません。
            </p>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeDrafts}
              onChange={(e) => setIncludeDrafts(e.target.checked)}
            />
            仮入力を含む見込みも分析する
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeDetails}
              onChange={(e) => setIncludeDetails(e.target.checked)}
            />
            収支の明細を含める
          </label>
          {includeDetails && (
            <div className="analysis-detail-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeMemos}
                  onChange={(e) => setIncludeMemos(e.target.checked)}
                />
                メモを含める
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includePaymentMethods}
                  onChange={(e) => setIncludePaymentMethods(e.target.checked)}
                />
                支払い・受取方法名を含める
              </label>
            </div>
          )}
          <p className="analysis-note">
            基本は期間の収支・月別収支・カテゴリ別集計です。カテゴリ名は含まれます。明細・メモ・支払い方法名は選んだ場合だけ含めます。
          </p>
          <label className="field">
            追加で相談したいこと（任意）
            <textarea
              aria-label="追加で相談したいこと"
              rows={3}
              maxLength={2000}
              value={question}
              placeholder="例：投資額を維持しながら、生活費を月1万円減らしたい"
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          {!hasData && !range.error && (
            <p role="status">
              対象期間に分析対象の記録がありません。期間や仮入力の設定を変更してください。
            </p>
          )}
          <button
            className="button primary"
            disabled={!hasData || !prompt}
            onClick={() => {
              setVisible(true);
              setMessage("");
            }}
          >
            <Sparkles size={17} />
            プロンプトを生成
          </button>
        </div>
      </section>
      {visible && hasData && prompt && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>プロンプトを確認してコピー</h2>
              <p>
                条件を変更すると本文も更新されます。貼り付ける前に、共有する内容を確認してください。
              </p>
            </div>
          </div>
          <div className="analysis-preview">
            <textarea
              ref={preview}
              aria-label="生成したプロンプト"
              readOnly
              value={prompt}
              spellCheck={false}
            />
            <div className="analysis-copy">
              <span>{prompt.length.toLocaleString("ja-JP")} 文字</span>
              <button
                className="button primary"
                disabled={copying}
                onClick={() => void copy()}
              >
                <Copy size={17} />
                {copying ? "コピー中…" : "プロンプトをコピー"}
              </button>
            </div>
            <p role="status">{message}</p>
            <p className="analysis-note">
              コピー後、利用するAIに貼り付けて分析を依頼してください。貼り付けて送信した内容は、そのAIサービスに共有されます。
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
