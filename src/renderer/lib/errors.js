// Translate the technical errors that bubble up from main, IPC, and
// the network into plain Arabic that an elderly mosque caretaker can
// understand. Every public string in the app should go through here
// before it lands in front of the operator.
//
// Pattern:
//   import { friendlyError } from '../lib/errors.js';
//   try { … } catch (err) { setMsg(friendlyError(err)); }
//
// `friendlyError` returns { title, hint } — the title is the
// short-explanation, the hint is what to do about it. UI components
// can render both or just the title.

const RULES = [
  // Network failures (IPC fetch, geolocation, Nominatim, updater)
  { match: /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ETIMEDOUT|fetch failed|Failed to fetch|NetworkError/i,
    title: 'تعذّر الاتصال بالإنترنت',
    hint: 'هذا طبيعي إذا كنت بدون إنترنت — التطبيق يعمل بدون انترنت. لو كنت متصلاً بالواي-فاي، تأكّد من الاتصال وحاول لاحقاً.' },

  // GPS / geolocation
  { match: /User denied geolocation|PERMISSION_DENIED|تم رفض الإذن/i,
    title: 'لم يُسمح بالوصول للموقع',
    hint: 'يمكنك كتابة اسم مدينتك يدوياً في مربع البحث، أو فتح إعدادات ويندوز للسماح بالموقع.' },
  { match: /POSITION_UNAVAILABLE|لا توجد إشارة GPS/i,
    title: 'إشارة GPS غير متوفرة',
    hint: 'الكمبيوترات المكتبية ما فيها GPS عادةً. اكتب مدينتك في مربع البحث بدلاً من ذلك.' },
  { match: /timeout|انتهى الوقت/i,
    title: 'استغرق الإجراء وقتاً طويلاً',
    hint: 'حاول مرة أخرى. لو تكرّر، اكتب اسم مدينتك يدوياً.' },

  // Config / file system
  { match: /EACCES|EPERM|operation not permitted/i,
    title: 'لا يوجد إذن لقراءة/كتابة الملف',
    hint: 'أعد تشغيل الكمبيوتر، ولو تكرّر تواصل مع الدعم.' },
  { match: /ENOSPC|no space left/i,
    title: 'مساحة القرص ممتلئة',
    hint: 'احذف ملفات قديمة من جهازك ثم أعد تشغيل التطبيق.' },
  { match: /ENOENT|no such file/i,
    title: 'ملف مطلوب غير موجود',
    hint: 'أعد تنصيب التطبيق — لو ظلّت المشكلة، تواصل مع الدعم.' },

  // PIN / auth
  { match: /forbidden|غير صحيح|wrong PIN|invalid PIN/i,
    title: 'رمز PIN غير صحيح',
    hint: 'تأكّد من الرمز وحاول مرة أخرى. لو نسيته، تواصل مع من ثبّت التطبيق لإعادة تعيينه.' },
  { match: /rate.*limit|تم تجاوز عدد المحاولات/i,
    title: 'تم تجاوز عدد محاولات إدخال الرمز',
    hint: 'انتظر بضع دقائق ثم حاول مرة أخرى.' },

  // Schema / config corruption
  { match: /schemaVersion.*newer|config.*too large|JSON|Unexpected token/i,
    title: 'ملف الإعدادات تالف',
    hint: 'تم استعادة الإعدادات الافتراضية تلقائياً. الملف القديم محفوظ بصيغة .bak. أعد ضبط إعداداتك المهمة.' },

  // PIN setup specific
  { match: /PIN must be 4.8 digits|الرمز يجب أن يكون/i,
    title: 'رمز PIN غير صالح',
    hint: 'الرمز يجب أن يكون أرقاماً فقط، بطول ٤ إلى ٨ أرقام.' },

  // Coordinates
  { match: /lat.*range|lng.*range|coords|coordinates/i,
    title: 'الإحداثيات غير صالحة',
    hint: 'خط العرض بين -٩٠ و ٩٠، خط الطول بين -١٨٠ و ١٨٠.' },

  // Updater
  { match: /update.*not configured|placeholder/i,
    title: 'التحديثات غير مفعّلة في هذا الإصدار',
    hint: 'التطبيق يعمل بشكل طبيعي بدون تحديث تلقائي. لو أردت آخر إصدار، تواصل مع المطوّر.' },
];

const FALLBACK = {
  title: 'حدث خطأ غير متوقّع',
  hint: 'حاول مرة أخرى. لو تكرّر، أعد تشغيل التطبيق أو تواصل مع الدعم.'
};

// Accept Error, string, {message}, or anything stringifiable.
export function friendlyError(err) {
  let raw = '';
  if (typeof err === 'string') raw = err;
  else if (err && typeof err.message === 'string') raw = err.message;
  else if (err && typeof err.error === 'string') raw = err.error;
  else if (err) { try { raw = JSON.stringify(err); } catch (_) { raw = String(err); } }
  if (!raw) return FALLBACK;
  for (const rule of RULES) {
    if (rule.match.test(raw)) {
      return { title: rule.title, hint: rule.hint, raw };
    }
  }
  return { ...FALLBACK, raw };
}

// Convenience: just the title, for places that only have one line.
export function friendlyErrorTitle(err) {
  return friendlyError(err).title;
}
