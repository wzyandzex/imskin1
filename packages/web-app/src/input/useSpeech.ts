/**
 * 语音输入 Hook（FR-INPUT-4）—— Web Speech API 实时转写。
 *
 * - AC1：录音实时转写，结果写回输入框，提交前用户可编辑。
 * - AC2：转写文本与手动输入走同一链路（本 hook 只产出文本，不做任何降级处理）。
 * - AC3：浏览器不支持 / 权限被拒 → supported=false 或 error 提示，优雅退回文字输入，
 *   ❌ 不静默失败。
 */

import { useEffect, useRef, useState } from "react";

/** 浏览器 SpeechRecognition 的最小类型（lib.dom 未内置）。 */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechResult {
  /** 浏览器是否支持语音识别。 */
  supported: boolean;
  /** 是否正在录音。 */
  listening: boolean;
  /** 最近一次错误的用户可读提示（权限拒绝/无声音等）；开始新录音时清空。 */
  error: string | null;
  /** 开始录音；转写片段通过 onText 增量回调（interim 结果覆盖式）。 */
  start: () => void;
  /** 停止录音。 */
  stop: () => void;
}

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "麦克风权限被拒绝，请在浏览器设置中允许后重试，或直接打字输入",
  "service-not-allowed": "语音服务不可用，请直接打字输入",
  "no-speech": "没有听到声音，请重试",
  "audio-capture": "找不到麦克风设备，请直接打字输入",
  network: "语音服务网络错误，请直接打字输入",
};

/**
 * @param onText 转写回调：(finalText, interimText)。final 为已定稿累计文本，
 *   interim 为当前未定稿片段；调用方一般显示 final + interim。
 */
export function useSpeech(onText: (finalText: string, interimText: string) => void): UseSpeechResult {
  const Ctor = getCtor();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => () => recRef.current?.stop(), []);

  const start = () => {
    if (!Ctor || listening) return;
    setError(null);
    finalRef.current = "";
    const rec = new Ctor();
    rec.lang = "zh-CN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      onTextRef.current(finalRef.current, interim);
    };
    rec.onerror = (e) => {
      setError(ERROR_TEXT[e.error] ?? `语音识别失败（${e.error}），请直接打字输入`);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => {
    recRef.current?.stop();
    setListening(false);
  };

  return { supported: Ctor !== null, listening, error, start, stop };
}
