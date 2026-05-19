'use client';

import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemCategory = 'plus' | 'minus';

type ItemRow = {
  id: string;
  category: ItemCategory;
  itemType: string;
  itemName: string;
  quantity: string;
  notes: string;
  systemCode: string;
  image: File | null;
  imageUrl: string;
};

type Msg = { type: 'success' | 'error'; text: string } | null;

type PageView = 'form' | 'success' | 'myForms' | 'formDetail' | 'kanban' | 'items';

type FormSummary = {
  id: string;
  organization: string;
  created_by_email: string | null;
  status: string;
  created_at: string;
};

type PlusItem = {
  id: string;
  form_id: string;
  item_type: string;
  item_name: string;
  quantity: number;
  notes: string | null;
  image_path: string | null;
  created_at: string;
};

type MinusItem = {
  id: string;
  form_id: string;
  item_type: string;
  item_name: string;
  quantity: number;
  system_code: string;
  notes: string | null;
  created_at: string;
};

type FormDetail = FormSummary & {
  message_to_admin: string | null;
  plusItems: PlusItem[];
  minusItems: MinusItem[];
};

type AllItem = {
  id: string;
  form_id: string;
  category: ItemCategory;
  item_type: string;
  item_name: string;
  quantity: number;
  notes: string | null;
  system_code?: string | null;
  created_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; bg: string; text: string }> = {
  new:      { label: 'نوێ',           bg: 'bg-sky-100',     text: 'text-sky-800' },
  sent:     { label: 'ناردراو',       bg: 'bg-amber-100',   text: 'text-amber-800' },
  reviewed: { label: 'هەڵسەنگاندراو', bg: 'bg-violet-100',  text: 'text-violet-800' },
  approved: { label: 'پەسەندکراو',    bg: 'bg-emerald-100', text: 'text-emerald-800' },
};

const STATUS_FLOW = ['new', 'sent', 'reviewed', 'approved'];

const superAdminEmail = process.env.NEXT_PUBLIC_SUPABASE_SUPERADMIN_EMAIL ?? '';

const defaultRow = (category: ItemCategory): ItemRow => ({
  id: `${category}-${Math.random().toString(36).slice(2)}-${Date.now()}`,
  category,
  itemType: '',
  itemName: '',
  quantity: '',
  notes: '',
  systemCode: '',
  image: null,
  imageUrl: '',
});

const blankForm = { organization: '', rows: [defaultRow('plus')], messageToAdmin: '' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, bg: 'bg-slate-100', text: 'text-slate-700' };
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-IQ', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomePage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMsg, setAuthMsg] = useState<Msg>(null);

  // ── Navigation ────────────────────────────────────────────────────────────
  const [activePage, setActivePage] = useState<PageView>('form');
  const [prevPage, setPrevPage] = useState<PageView>('myForms');

  // ── Form creation ─────────────────────────────────────────────────────────
  const [formState, setFormState] = useState(blankForm);
  const [submitMsg, setSubmitMsg] = useState<Msg>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── Success screen ────────────────────────────────────────────────────────
  const [lastFormId, setLastFormId] = useState<string | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Forms list ────────────────────────────────────────────────────────────
  const [forms, setForms] = useState<FormSummary[]>([]);

  // ── Form detail (A4 view) ─────────────────────────────────────────────────
  const [formDetailId, setFormDetailId] = useState<string | null>(null);
  const [selectedForm, setSelectedForm] = useState<FormDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const a4Ref = useRef<HTMLDivElement>(null);

  // ── Admin: direct items ───────────────────────────────────────────────────
  const [allItems, setAllItems] = useState<AllItem[]>([]);
  const [addCat, setAddCat] = useState<ItemCategory>('plus');
  const [addType, setAddType] = useState('');
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addCode, setAddCode] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [itemsMsg, setItemsMsg] = useState<Msg>(null);

  const isSuperAdmin =
    Boolean(user?.email) &&
    user.email.toLowerCase() === superAdminEmail.toLowerCase();

  // ── Auth init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoadingAuth(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (activePage === 'myForms' || activePage === 'kanban') fetchForms();
    if (activePage === 'items') fetchAllItems();
  }, [user, activePage]);

  // Auto-print once form detail is loaded and ready
  useEffect(() => {
    if (autoPrint && selectedForm && activePage === 'formDetail') {
      setAutoPrint(false);
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [autoPrint, selectedForm, activePage]);

  // Fetch form detail whenever formDetailId changes
  useEffect(() => {
    if (!formDetailId) return;
    let cancelled = false;

    const fetchDetail = async () => {
      setDetailLoading(true);
      setDetailError(null);
      setSelectedForm(null);

      const [formRes, plusRes, minusRes] = await Promise.all([
        supabase.from('inventory_forms').select('*').eq('id', formDetailId).single(),
        supabase.from('plus_items').select('*').eq('form_id', formDetailId).order('created_at'),
        supabase.from('minus_items').select('*').eq('form_id', formDetailId).order('created_at'),
      ]);

      if (cancelled) return;

      if (formRes.error || !formRes.data) {
        setDetailError(`هەڵە لە بارکردنی فۆرم: ${formRes.error?.message ?? 'فۆرم نەدۆزرایەوە'}`);
        setDetailLoading(false);
        return;
      }
      if (plusRes.error) {
        setDetailError(`هەڵە لە بارکردنی کەل و پەلی زیاد: ${plusRes.error.message}`);
        setDetailLoading(false);
        return;
      }
      if (minusRes.error) {
        setDetailError(`هەڵە لە بارکردنی کەل و پەلی کەم: ${minusRes.error.message}`);
        setDetailLoading(false);
        return;
      }

      setSelectedForm({
        ...formRes.data,
        plusItems: plusRes.data ?? [],
        minusItems: minusRes.data ?? [],
      });
      setDetailLoading(false);
    };

    fetchDetail();
    return () => { cancelled = true; };
  }, [formDetailId]);

  // ── Auth actions ──────────────────────────────────────────────────────────
  const handleAuth = async () => {
    setAuthMsg(null);
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthMsg({ type: 'error', text: 'تکایە ئیمەیڵ و تێپەڕەوشە بنووسە.' });
      return;
    }
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) { setAuthMsg({ type: 'error', text: error.message }); return; }
    } else {
      const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
      if (error) { setAuthMsg({ type: 'error', text: error.message }); return; }
      setAuthMsg({ type: 'success', text: 'تکایە پەیامی ئیمەیڵەکەت بگورە بۆ چالاककردنی ئەکاونت.' });
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setFormState(blankForm);
    setForms([]);
    setActivePage('form');
  };

  // ── Navigate helper ───────────────────────────────────────────────────────
  const goTo = (page: PageView) => {
    setPrevPage(activePage);
    setActivePage(page);
  };

  // ── Fetch forms list ──────────────────────────────────────────────────────
  const fetchForms = async () => {
    if (!user) return;
    let q = supabase
      .from('inventory_forms')
      .select('id, organization, created_by_email, status, created_at')
      .order('created_at', { ascending: false });
    if (!isSuperAdmin) q = q.eq('created_by', user.id);
    const { data } = await q;
    setForms(data ?? []);
  };

  // ── Download A4 as PDF ────────────────────────────────────────────────────
  const downloadPdf = async () => {
    if (!a4Ref.current || !selectedForm) return;
    setIsPdfLoading(true);
    try {
      // Dynamic import keeps html2pdf.js out of the SSR bundle
      const html2pdf = ((await import('html2pdf.js')) as any).default; // eslint-disable-line
      await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: `inventory-form-${selectedForm.id}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(a4Ref.current)
        .save();
    } finally {
      setIsPdfLoading(false);
    }
  };

  // ── Open A4 detail view ───────────────────────────────────────────────────
  const openFormDetail = (formId: string, from: PageView = 'myForms', print = false) => {
    setPrevPage(from);
    if (print) setAutoPrint(true);
    setSelectedForm(null);
    setDetailError(null);
    setDetailLoading(true);
    setFormDetailId(formId);
    setActivePage('formDetail');
  };

  // ── Fetch all items (admin) ───────────────────────────────────────────────
  const fetchAllItems = async () => {
    const [plusRes, minusRes] = await Promise.all([
      supabase.from('plus_items').select('*').order('created_at', { ascending: false }),
      supabase.from('minus_items').select('*').order('created_at', { ascending: false }),
    ]);
    const combined: AllItem[] = [
      ...(plusRes.data ?? []).map((i: any) => ({ ...i, category: 'plus' as const })),
      ...(minusRes.data ?? []).map((i: any) => ({ ...i, category: 'minus' as const })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setAllItems(combined);
  };

  // ── Form row helpers ──────────────────────────────────────────────────────
  const addRow = (cat: ItemCategory) =>
    setFormState(p => ({ ...p, rows: [...p.rows, defaultRow(cat)] }));

  const updateRow = (id: string, changes: Partial<ItemRow>) =>
    setFormState(p => ({ ...p, rows: p.rows.map(r => r.id === id ? { ...r, ...changes } : r) }));

  const removeRow = (id: string) =>
    setFormState(p => ({ ...p, rows: p.rows.filter(r => r.id !== id) }));

  // ── Validate ──────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!formState.organization.trim()) return 'تکایە ناوی ئۆرگان بنووسە.';
    if (formState.rows.length === 0) return 'تکایە یەک ریزە زیاد بکە.';
    for (const r of formState.rows) {
      if (!r.itemType.trim()) return 'تکایە جۆری کەل و پەل دیاری بکە.';
      if (!r.itemName.trim()) return 'تکایە ناوی کەل و پەل بنووسە.';
      const q = Number(r.quantity);
      if (!r.quantity || isNaN(q) || q <= 0) return 'ژمارە دەبێت ژمارەیەکی دروست بێت.';
      if (r.category === 'minus' && !r.systemCode.trim()) return 'تکایە کۆدی سیستەم بۆ کەمبوو بنووسە.';
    }
    return null;
  };

  // ── Upload image ──────────────────────────────────────────────────────────
  const uploadImage = async (file: File): Promise<string> => {
    const path = `inventory_images/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('inventory_images')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw new Error(error.message);
    return data.path;
  };

  // ── Core submit ───────────────────────────────────────────────────────────
  const submitForm = async (status: 'new' | 'sent') => {
    const err = validate();
    if (err) { setSubmitMsg({ type: 'error', text: err }); return; }

    setIsSaving(true);
    setSubmitMsg(null);

    let createdFormId: string | null = null;
    try {
      // 1. Insert form row
      const { data: formRecord, error: formErr } = await supabase
        .from('inventory_forms')
        .insert([{
          organization: formState.organization,
          created_by: user.id,
          created_by_email: user.email,
          status,
          message_to_admin: formState.messageToAdmin || null,
        }])
        .select('id')
        .single();

      if (formErr || !formRecord) throw formErr ?? new Error('تۆمارکردنی فۆرم سەرکەوتنەبوو');
      createdFormId = formRecord.id;

      // 2. Insert plus items
      const plusRows = formState.rows.filter(r => r.category === 'plus');
      if (plusRows.length > 0) {
        const payload = await Promise.all(plusRows.map(async r => ({
          form_id: formRecord.id,
          item_type: r.itemType,
          item_name: r.itemName,
          quantity: Number(r.quantity),
          notes: r.notes || null,
          image_path: r.image ? await uploadImage(r.image) : null,
        })));
        const { error } = await supabase.from('plus_items').insert(payload);
        if (error) throw error;
      }

      // 3. Insert minus items
      const minusRows = formState.rows.filter(r => r.category === 'minus');
      if (minusRows.length > 0) {
        const payload = minusRows.map(r => ({
          form_id: formRecord.id,
          item_type: r.itemType,
          item_name: r.itemName,
          quantity: Number(r.quantity),
          system_code: r.systemCode,
          notes: r.notes || null,
        }));
        const { error } = await supabase.from('minus_items').insert(payload);
        if (error) throw error;
      }

      setLastFormId(formRecord.id);
      setFormState(blankForm);
      setActivePage('success');
    } catch (e) {
      // Roll back the form record so it doesn't appear in the list without items
      if (createdFormId) {
        await supabase.from('inventory_forms').delete().eq('id', createdFormId);
      }
      setSubmitMsg({ type: 'error', text: `هەڵەیەک ڕوویدا: ${(e as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Change form status ────────────────────────────────────────────────────
  const changeStatus = async (formId: string, next: string) => {
    await supabase.from('inventory_forms').update({ status: next }).eq('id', formId);
    setSelectedForm(p => p?.id === formId ? { ...p, status: next } : p);
    setForms(prev => prev.map(f => f.id === formId ? { ...f, status: next } : f));
  };

  // ── Delete form ───────────────────────────────────────────────────────────
  const deleteForm = async (formId: string) => {
    if (!window.confirm('ئایا دڵنیایت دەتەوێت ئەم فۆرمە بسڕیتەوە؟ ئەم کردارە گەڕاندنەوەیەکی نییە.')) return;

    const { data: plusItems } = await supabase
      .from('plus_items').select('image_path').eq('form_id', formId);

    const imagePaths = (plusItems ?? [])
      .map((i: any) => i.image_path).filter(Boolean) as string[];
    if (imagePaths.length > 0) {
      await supabase.storage.from('inventory_images').remove(imagePaths);
    }

    await supabase.from('plus_items').delete().eq('form_id', formId);
    await supabase.from('minus_items').delete().eq('form_id', formId);
    await supabase.from('inventory_forms').delete().eq('id', formId);

    setForms(prev => prev.filter(f => f.id !== formId));
    if (selectedForm?.id === formId) {
      setSelectedForm(null);
      setActivePage('myForms');
    }
  };

  // ── Admin: add direct item ────────────────────────────────────────────────
  const handleAddItem = async () => {
    if (!addType.trim() || !addName.trim()) {
      setItemsMsg({ type: 'error', text: 'تکایە جۆر و ناوی کەل و پەل بنووسە.' }); return;
    }
    const qty = Number(addQty);
    if (!addQty || isNaN(qty) || qty <= 0) {
      setItemsMsg({ type: 'error', text: 'ژمارە دەبێت ژمارەیەکی دروست بێت.' }); return;
    }
    if (addCat === 'minus' && !addCode.trim()) {
      setItemsMsg({ type: 'error', text: 'تکایە کۆدی سیستەم بنووسە.' }); return;
    }
    setIsAdding(true);
    setItemsMsg(null);
    try {
      const { data: formRec, error: formErr } = await supabase
        .from('inventory_forms')
        .insert([{ organization: 'ڕاستەوخۆ', created_by: user.id, created_by_email: user.email, status: 'approved', message_to_admin: null }])
        .select('id').single();
      if (formErr || !formRec) throw formErr ?? new Error('هەڵە');
      if (addCat === 'plus') {
        await supabase.from('plus_items').insert([{ form_id: formRec.id, item_type: addType, item_name: addName, quantity: qty, notes: addNotes || null, image_path: null }]);
      } else {
        await supabase.from('minus_items').insert([{ form_id: formRec.id, item_type: addType, item_name: addName, quantity: qty, system_code: addCode, notes: addNotes || null }]);
      }
      setItemsMsg({ type: 'success', text: 'کەل و پەل بە سەرکەوتوویی زیادکرا.' });
      setAddType(''); setAddName(''); setAddQty(''); setAddCode(''); setAddNotes('');
      fetchAllItems();
    } catch (e) {
      setItemsMsg({ type: 'error', text: `هەڵەیەک ڕوویدا: ${(e as Error).message}` });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteItem = async (id: string, cat: ItemCategory) => {
    await supabase.from(cat === 'plus' ? 'plus_items' : 'minus_items').delete().eq('id', id);
    fetchAllItems();
  };

  // ── Download form rows as Excel ───────────────────────────────────────────
  const handleDownloadExcel = () => {
    const workbook = XLSX.utils.book_new();
    const date = new Date().toISOString().split('T')[0];

    const plusRows = formState.rows.filter(r => r.category === 'plus');
    if (plusRows.length > 0) {
      const plusData = plusRows.map((row, i) => ({
        'ڕیزبەندی': i + 1,
        'جۆری کەل و پەل': row.itemType,
        'ناوی کەل و پەل': row.itemName,
        'ژمارە': row.quantity,
        'تێبینی': row.notes,
      }));
      const ws = XLSX.utils.json_to_sheet(plusData);
      ws['!dir'] = 'rtl';
      XLSX.utils.book_append_sheet(workbook, ws, 'کەل و پەلی زیادە');
    }

    const minusRows = formState.rows.filter(r => r.category === 'minus');
    if (minusRows.length > 0) {
      const minusData = minusRows.map((row, i) => ({
        'ڕیزبەندی': i + 1,
        'جۆری کەل و پەل': row.itemType,
        'ناوی کەل و پەل': row.itemName,
        'ژمارە': row.quantity,
        'کۆدی سیستەم': row.systemCode,
        'تێبینی': row.notes,
      }));
      const ws = XLSX.utils.json_to_sheet(minusData);
      ws['!dir'] = 'rtl';
      XLSX.utils.book_append_sheet(workbook, ws, 'کەل و پەلی کەمبوو');
    }

    if (workbook.SheetNames.length === 0) return;
    XLSX.writeFile(workbook, `فۆرمی_جەرد_${date}.xlsx`);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-600 shadow-sm">
          چاوەڕوانکردنی دەستپێکردن...
        </div>
      </div>
    );
  }

  // ── Auth screen ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm rtl">
          <h1 className="text-xl font-bold text-slate-900 mb-6">چوونە ژوورەوە یان دروستکردن</h1>
          <div className="grid gap-4">
            <div className="flex gap-2">
              {(['login', 'signup'] as const).map(mode => (
                <button key={mode} type="button" onClick={() => setAuthMode(mode)}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${authMode === mode ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  {mode === 'login' ? 'چوونە ژوورەوە' : 'دروستکردنی ئەکاونت'}
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium text-slate-700">
              ئیمەیڵ
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              تێپەڕەوشە
              <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAuth()}
                className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
            </label>
            {authMsg && (
              <div className={`rounded-2xl p-3 text-sm ${authMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                {authMsg.text}
              </div>
            )}
            <button type="button" onClick={handleAuth}
              className="rounded-3xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700">
              {authMode === 'login' ? 'چوونە ژوورەوە' : 'دروستکردنی ئەکاونت'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main app ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6 print:p-0 print:bg-white rtl">
      <div className="mx-auto w-full max-w-[1200px]">

        {/* ── Header ── */}
        <header className="no-print mb-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">سیستەمی جەردی کەل و پەل</p>
              <h1 className="text-xl font-bold text-slate-900">فۆرمی جیاوازییەکانی جەرد</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm">
                <div className="font-medium text-slate-800">{user.email}</div>
                <div className="text-xs text-slate-500">{isSuperAdmin ? 'سوپەر ئەدمین' : 'کارمەند'}</div>
              </div>
              <button onClick={signOut}
                className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition">
                دەرچوون
              </button>
            </div>
          </div>
        </header>

        {/* ── Navigation ── */}
        <nav className="no-print mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { key: 'form',    label: 'فۆرمی تازە',                         desc: 'کەل و پەلی جیاوازی تۆمار بکە' },
            { key: 'myForms', label: isSuperAdmin ? 'هەموو فۆرمەکان' : 'فۆرمەکانم', desc: 'فۆرمە پێشکەشکراوەکان ببینە' },
            ...(isSuperAdmin ? [
              { key: 'kanban', label: 'کانبان', desc: 'شوێنکەوتنی ئاست' },
              { key: 'items',  label: 'کەل و پەلەکان', desc: 'زیادکردن و سڕینەوە' },
            ] : []),
          ].map(item => (
            <button key={item.key} type="button"
              onClick={() => goTo(item.key as PageView)}
              className={`rounded-2xl border px-4 py-3.5 text-right transition ${
                activePage === item.key
                  ? 'border-sky-500 bg-sky-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}>
              <div className="font-semibold text-sm text-slate-900">{item.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
            </button>
          ))}
        </nav>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* VIEW: Form creation                                              */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activePage === 'form' && (
          <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none print:p-0">
            <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">فۆرمی تازەی جیاوازی جەرد</h2>
              <div className="flex gap-2">
                <button type="button" onClick={() => addRow('plus')}
                  className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                  + زیادە
                </button>
                <button type="button" onClick={() => addRow('minus')}
                  className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700">
                  + کەمبوو
                </button>
              </div>
            </div>

            <div className="no-print grid gap-5">
              {/* Organization */}
              <label className="block text-sm font-medium text-slate-700">
                ناوی ئۆرگان
                <input type="text" value={formState.organization}
                  onChange={e => setFormState(p => ({ ...p, organization: e.target.value }))}
                  placeholder="ناوی ئۆرگان بنووسە"
                  className="mt-1.5 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              </label>

              {/* Plus rows table */}
              {formState.rows.filter(r => r.category === 'plus').length > 0 && (
                <div className="overflow-x-auto rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <h3 className="mb-3 font-semibold text-emerald-800 text-sm">کەل و پەلی زیادە (+)</h3>
                  <table className="min-w-full border-separate border-spacing-0 text-right text-sm">
                    <thead>
                      <tr>
                        {['جۆری کەل و پەل', 'ناوی کەل و پەل', 'ژمارە', 'وێنە', 'تێبینی', ''].map(h => (
                          <th key={h} className="border border-emerald-200 bg-emerald-100 px-3 py-2.5 font-semibold text-emerald-900 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {formState.rows.filter(r => r.category === 'plus').map(row => (
                        <tr key={row.id} className="bg-white">
                          <td className="border border-emerald-200 p-1.5">
                            <input value={row.itemType} onChange={e => updateRow(row.id, { itemType: e.target.value })}
                              className="w-full min-w-[120px] rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
                          </td>
                          <td className="border border-emerald-200 p-1.5">
                            <input value={row.itemName} onChange={e => updateRow(row.id, { itemName: e.target.value })}
                              className="w-full min-w-[140px] rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
                          </td>
                          <td className="border border-emerald-200 p-1.5">
                            <input type="number" min={0} value={row.quantity} onChange={e => updateRow(row.id, { quantity: e.target.value })}
                              className="w-24 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
                          </td>
                          <td className="border border-emerald-200 p-1.5">
                            <input type="file" accept="image/*"
                              onChange={e => {
                                const file = e.target.files?.[0] ?? null;
                                updateRow(row.id, { image: file, imageUrl: file ? URL.createObjectURL(file) : '' });
                              }}
                              className="w-full text-xs file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-slate-700" />
                            {row.imageUrl && <img src={row.imageUrl} alt="" className="mt-1.5 h-14 object-contain" />}
                          </td>
                          <td className="border border-emerald-200 p-1.5">
                            <input value={row.notes} onChange={e => updateRow(row.id, { notes: e.target.value })}
                              className="w-full min-w-[120px] rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
                          </td>
                          <td className="border border-emerald-200 p-1.5 text-center">
                            <button onClick={() => removeRow(row.id)}
                              className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600">
                              سڕ
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Minus rows table */}
              {formState.rows.filter(r => r.category === 'minus').length > 0 && (
                <div className="overflow-x-auto rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                  <h3 className="mb-3 font-semibold text-rose-800 text-sm">کەل و پەلی کەمبوو (-)</h3>
                  <table className="min-w-full border-separate border-spacing-0 text-right text-sm">
                    <thead>
                      <tr>
                        {['جۆری کەل و پەل', 'ناوی کەل و پەل', 'ژمارە', 'کۆدی سیستەم', 'تێبینی', ''].map(h => (
                          <th key={h} className="border border-rose-200 bg-rose-100 px-3 py-2.5 font-semibold text-rose-900 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {formState.rows.filter(r => r.category === 'minus').map(row => (
                        <tr key={row.id} className="bg-white">
                          <td className="border border-rose-200 p-1.5">
                            <input value={row.itemType} onChange={e => updateRow(row.id, { itemType: e.target.value })}
                              className="w-full min-w-[120px] rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
                          </td>
                          <td className="border border-rose-200 p-1.5">
                            <input value={row.itemName} onChange={e => updateRow(row.id, { itemName: e.target.value })}
                              className="w-full min-w-[140px] rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
                          </td>
                          <td className="border border-rose-200 p-1.5">
                            <input type="number" min={0} value={row.quantity} onChange={e => updateRow(row.id, { quantity: e.target.value })}
                              className="w-24 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
                          </td>
                          <td className="border border-rose-200 p-1.5">
                            <input value={row.systemCode} onChange={e => updateRow(row.id, { systemCode: e.target.value })}
                              className="w-full min-w-[120px] rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
                          </td>
                          <td className="border border-rose-200 p-1.5">
                            <input value={row.notes} onChange={e => updateRow(row.id, { notes: e.target.value })}
                              className="w-full min-w-[120px] rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
                          </td>
                          <td className="border border-rose-200 p-1.5 text-center">
                            <button onClick={() => removeRow(row.id)}
                              className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600">
                              سڕ
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Message to admin */}
              <label className="block text-sm font-medium text-slate-700">
                پەیام بۆ سوپەرئەدمین (ئەگەر پێویستت بوو)
                <textarea rows={3} value={formState.messageToAdmin}
                  onChange={e => setFormState(p => ({ ...p, messageToAdmin: e.target.value }))}
                  placeholder="پەیامێکت بنووسە..."
                  className="mt-1.5 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              </label>

              {submitMsg && (
                <div className={`rounded-2xl p-4 text-sm ${submitMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                  {submitMsg.text}
                </div>
              )}

              {/* Action buttons */}
              <div className="grid gap-3 sm:grid-cols-5 no-print">
                <button type="button" onClick={() => submitForm('new')} disabled={isSaving}
                  className="rounded-2xl bg-sky-600 px-5 py-3 font-semibold text-white hover:bg-sky-700 disabled:bg-slate-400 transition">
                  {isSaving ? 'چاوەڕوانبکە...' : 'پاشەکەوتکردن (ڕەشنووس)'}
                </button>
                <button type="button" onClick={() => submitForm('sent')} disabled={isSaving}
                  className="rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-400 transition">
                  {isSaving ? 'چاوەڕوانبکە...' : 'ناردن بۆ سوپەرئەدمین'}
                </button>
                <button type="button"
                  onClick={() => { setFormState(blankForm); setSubmitMsg(null); }}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 transition">
                  پاككردنەوە
                </button>
                {/* Excel download */}
                <button type="button" onClick={handleDownloadExcel}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 py-3 font-semibold text-white hover:bg-teal-700 transition">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Excel
                </button>
                {/* Print current form */}
                <button type="button" onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 font-semibold text-white hover:bg-slate-900 transition">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  چاپکردن
                </button>
              </div>
            </div>

            {/* ── A4 print-only view (hidden on screen, shown only during print) ── */}
            <div className="hidden print:block">
              <div className="a4-container bg-white p-0">

                {/* Document header */}
                <div className="border-b-2 border-black pb-4 mb-5 text-center">
                  <h1 style={{ fontSize: '18pt', fontWeight: 'bold' }}>کەل و پەلی زیاد و کەمی جەرد</h1>
                  <p style={{ fontSize: '12pt', marginTop: '6px', fontWeight: '600' }}>{formState.organization || '_______________'}</p>
                </div>

                {/* Plus items */}
                <div className="mb-5">
                  <div className="rounded-t-lg px-4 py-2" style={{ background: '#059669' }}>
                    <h2 style={{ color: 'white', fontWeight: 'bold', fontSize: '12pt', margin: 0 }}>
                      کەل و پەلی زیاد (+)
                    </h2>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
                    <thead>
                      <tr style={{ background: '#f0fdf4' }}>
                        {['ژمارە', 'جۆری کەلوپەل', 'ناوی کەلوپەل', 'بڕ', 'وێنە', 'تێبینی'].map(h => (
                          <th key={h} style={{ border: '1px solid #a7f3d0', padding: '8px', textAlign: 'right', fontWeight: '600' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {formState.rows.filter(r => r.category === 'plus').length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ border: '1px solid #e2e8f0', padding: '10px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                            هیچ کەل و پەلی زیادەیەک نییە
                          </td>
                        </tr>
                      ) : formState.rows.filter(r => r.category === 'plus').map((row, i) => (
                        <tr key={row.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px', textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px' }}>{row.itemType}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px', fontWeight: '600' }}>{row.itemName}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px', textAlign: 'center', fontWeight: 'bold', color: '#065f46' }}>{row.quantity}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px', textAlign: 'center' }}>
                            {row.imageUrl
                              ? <img src={row.imageUrl} alt="" style={{ maxHeight: '60px', objectFit: 'contain', display: 'inline-block' }} />
                              : <span style={{ color: '#cbd5e1' }}>—</span>}
                          </td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px', color: '#64748b' }}>{row.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Minus items */}
                <div className="mb-5">
                  <div className="rounded-t-lg px-4 py-2" style={{ background: '#dc2626' }}>
                    <h2 style={{ color: 'white', fontWeight: 'bold', fontSize: '12pt', margin: 0 }}>
                      کەل و پەلی کەم (-)
                    </h2>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
                    <thead>
                      <tr style={{ background: '#fff1f2' }}>
                        {['ژمارە', 'جۆری کەلوپەل', 'ناوی کەلوپەل', 'بڕ', 'کۆدی سیستەم', 'تێبینی'].map(h => (
                          <th key={h} style={{ border: '1px solid #fecdd3', padding: '8px', textAlign: 'right', fontWeight: '600' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {formState.rows.filter(r => r.category === 'minus').length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ border: '1px solid #e2e8f0', padding: '10px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                            هیچ کەل و پەلی کەمبووێک نییە
                          </td>
                        </tr>
                      ) : formState.rows.filter(r => r.category === 'minus').map((row, i) => (
                        <tr key={row.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px', textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px' }}>{row.itemType}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px', fontWeight: '600' }}>{row.itemName}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px', textAlign: 'center', fontWeight: 'bold', color: '#991b1b' }}>{row.quantity}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px', fontFamily: 'monospace' }}>{row.systemCode || '—'}</td>
                          <td style={{ border: '1px solid #e2e8f0', padding: '7px', color: '#64748b' }}>{row.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Message to admin */}
                {formState.messageToAdmin && (
                  <div className="mb-5 rounded-xl border border-amber-200 p-4" style={{ fontSize: '11pt' }}>
                    <span className="font-semibold text-amber-800">پەیام بۆ سوپەرئەدمین: </span>
                    <span>{formState.messageToAdmin}</span>
                  </div>
                )}


              </div>
            </div>
            {/* /print-only view */}

          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* VIEW: Success confirmation                                       */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activePage === 'success' && (
          <div className="rounded-[24px] border border-slate-200 bg-white p-10 shadow-sm text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-10 w-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">فۆرم بە سەرکەوتوویی تۆمارکرا!</h2>
            <p className="text-slate-500 mb-8">فۆرمەکەت پاشەکەوتکرا و بۆ سوپەرئەدمین نێردرا.</p>

            <div className="flex flex-wrap justify-center gap-3">
              <button type="button"
                onClick={() => lastFormId && openFormDetail(lastFormId, 'success')}
                className="rounded-2xl bg-sky-600 px-6 py-3 font-semibold text-white hover:bg-sky-700">
                بینینی فۆرم (A4)
              </button>
              <button type="button"
                onClick={() => { setActivePage('myForms'); fetchForms(); }}
                className="rounded-2xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50">
                فۆرمەکانم
              </button>
              <button type="button" onClick={() => setActivePage('form')}
                className="rounded-2xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50">
                فۆرمی تازە
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* VIEW: Forms list (staff = own, admin = all)                      */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activePage === 'myForms' && (
          <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            {detailError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {detailError}
              </div>
            )}
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {isSuperAdmin ? 'هەموو فۆرمەکان' : 'فۆرمەکانم'}
              </h2>
              <button onClick={fetchForms}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                نوێکردنەوە
              </button>
            </div>
            {detailLoading && (
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                چاوەڕوانبکە، فۆرمەکە بارەکەیدەکرێت...
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-right text-sm">
                <thead>
                  <tr>
                    {['کردار', 'ئۆرگان', 'پێشکەشکار', 'ئاست', 'بەروار'].map(h => (
                      <th key={h} className="border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {forms.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="border border-slate-200 p-10 text-center text-slate-400">
                        هیچ فۆرمێک نییە.
                      </td>
                    </tr>
                  ) : forms.map(form => (
                    <tr key={form.id} className="odd:bg-white even:bg-slate-50 hover:bg-sky-50 transition-colors">
                      {/* ── Action buttons — first column ── */}
                      <td className="border border-slate-200 px-3 py-2.5 text-center whitespace-nowrap">
                        <div className="inline-flex gap-2">
                          {/* 👁 View */}
                          <button
                            onClick={() => openFormDetail(form.id, 'myForms', false)}
                            disabled={detailLoading}
                            title="بینینی فۆرم"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 transition"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            بینین
                          </button>
                          {/* 🖨 Print */}
                          <button
                            onClick={() => openFormDetail(form.id, 'myForms', true)}
                            disabled={detailLoading}
                            title="چاپکردنی فۆرم"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50 transition"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            چاپ
                          </button>
                          {/* 🗑 Delete */}
                          <button
                            onClick={() => deleteForm(form.id)}
                            disabled={detailLoading}
                            title="سڕینەوەی فۆرم"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            سڕینەوە
                          </button>
                        </div>
                      </td>
                      <td className="border border-slate-200 px-4 py-3 font-medium text-slate-900">{form.organization}</td>
                      <td className="border border-slate-200 px-4 py-3 text-slate-500 text-xs">{form.created_by_email}</td>
                      <td className="border border-slate-200 px-4 py-3">
                        <StatusBadge status={form.status} />
                      </td>
                      <td className="border border-slate-200 px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {formatDate(form.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* VIEW: Form Detail — A4 official document                         */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activePage === 'formDetail' && detailLoading && (
          <div className="flex items-center justify-center py-24 text-slate-500 text-sm gap-3">
            <svg className="animate-spin h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            فۆرم بارکراوە...
          </div>
        )}
        {activePage === 'formDetail' && !detailLoading && selectedForm && (
          <div>
            {/* Action bar (hidden on print) */}
            <div className="no-print mb-4 flex flex-wrap items-center gap-3">
              <button onClick={() => setActivePage(prevPage)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                ← گەڕانەوە
              </button>
              <button
                onClick={() => window.print()}
                className="print:hidden inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                چاپکردن (A4)
              </button>
              <button
                onClick={() => window.print()}
                className="print:hidden inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                دابەزاندنی PDF
              </button>
              <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                فۆرمی پاشەکەوتکراو — Read-Only
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">ئاست:</span>
                <StatusBadge status={selectedForm.status} />
              </div>
              {isSuperAdmin && (
                <div className="flex flex-wrap gap-2">
                  {STATUS_FLOW.filter(s => s !== selectedForm.status).map(s => (
                    <button key={s} onClick={() => changeStatus(selectedForm.id, s)}
                      className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${STATUS[s].bg} ${STATUS[s].text} border-current hover:opacity-80`}>
                      بگۆڕە بۆ {STATUS[s].label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── A4 Document ── */}
            {!detailLoading && selectedForm.plusItems.length === 0 && selectedForm.minusItems.length === 0 && (
              <div className="no-print mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                ئاگاداری: هیچ کەل و پەلێک بارنەکراوە. ئەگەر فۆرمەکە پڕکراوە، تکایە مسۆگەری کە سیاسەتەکانی خوێندنەوەی Supabase دروست دانراون.
              </div>
            )}

            <div ref={a4Ref} className="print-area a4-container mx-auto bg-white shadow-paper border border-slate-200 p-[15mm]">

              {/* Document header — title and organisation only */}
              <div className="border-b-2 border-black pb-4 mb-3 text-center">
                <h1 className="text-[22pt] font-bold text-black leading-tight">کەل و پەلی زیاد و کەمی جەرد</h1>
                <p className="text-base font-semibold text-slate-800 mt-2">{selectedForm.organization}</p>
              </div>

              {/* Archival metadata — date and submitter; frozen at submission time */}
              <div className="mb-4 flex flex-wrap justify-between gap-2 border-b border-slate-200 pb-2 text-xs text-slate-500">
                <span>
                  <span className="font-semibold text-slate-700">بەرواری تۆمارکردن: </span>
                  {formatDate(selectedForm.created_at)}
                </span>
                <span>
                  <span className="font-semibold text-slate-700">پێشکەشکراوە لەلایەن: </span>
                  {selectedForm.created_by_email ?? '—'}
                </span>
              </div>

              {/* Plus items table */}
              <div className="mb-5">
                <div className="rounded-t-xl bg-emerald-600 px-4 py-2.5">
                  <h2 className="font-bold text-white text-sm">کەل و پەلی زیاد (+)</h2>
                </div>
                <table className="w-full border-separate border-spacing-0 text-right text-sm">
                  <thead>
                    <tr className="bg-emerald-50">
                      {['#', 'جۆری کەل و پەل', 'ناوی کەل و پەل', 'ژمارە', 'وێنە', 'تێبینی'].map((h, i) => (
                        <th key={h} className={`border border-emerald-200 px-3 py-2.5 font-semibold text-emerald-900 ${i === 0 ? 'w-10 text-center' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedForm.plusItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="border border-slate-200 p-4 text-center text-slate-400 italic">
                          هیچ کەل و پەلی زیادەیەک نییە
                        </td>
                      </tr>
                    ) : selectedForm.plusItems.map((item, i) => {
                      const imgUrl = item.image_path
                        ? supabase.storage.from('inventory_images').getPublicUrl(item.image_path).data.publicUrl
                        : null;
                      return (
                        <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-emerald-50/30'}>
                          <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-500 font-medium">{i + 1}</td>
                          <td className="border border-slate-200 px-3 py-2.5">{item.item_type}</td>
                          <td className="border border-slate-200 px-3 py-2.5 font-semibold">{item.item_name}</td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center font-bold text-emerald-700">{item.quantity}</td>
                          <td className="border border-slate-200 px-3 py-2.5 text-center">
                            {imgUrl
                              ? <img src={imgUrl} alt="وێنەی کەل و پەل"
                                  className="mx-auto object-contain print:max-h-[80px]"
                                  style={{ maxHeight: '150px' }} />
                              : <span className="text-slate-300">—</span>
                            }
                          </td>
                          <td className="border border-slate-200 px-3 py-2.5 text-slate-500">{item.notes ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Minus items table */}
              <div className="mb-5">
                <div className="rounded-t-xl bg-rose-600 px-4 py-2.5">
                  <h2 className="font-bold text-white text-sm">کەل و پەلی کەم (-)</h2>
                </div>
                <table className="w-full border-separate border-spacing-0 text-right text-sm">
                  <thead>
                    <tr className="bg-rose-50">
                      {['#', 'جۆری کەل و پەل', 'ناوی کەل و پەل', 'ژمارە', 'کۆدی سیستەم', 'تێبینی'].map((h, i) => (
                        <th key={h} className={`border border-rose-200 px-3 py-2.5 font-semibold text-rose-900 ${i === 0 ? 'w-10 text-center' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedForm.minusItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="border border-slate-200 p-4 text-center text-slate-400 italic">
                          هیچ کەل و پەلی کەمبووێک نییە
                        </td>
                      </tr>
                    ) : selectedForm.minusItems.map((item, i) => (
                      <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-rose-50/30'}>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-slate-500 font-medium">{i + 1}</td>
                        <td className="border border-slate-200 px-3 py-2.5">{item.item_type}</td>
                        <td className="border border-slate-200 px-3 py-2.5 font-semibold">{item.item_name}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center font-bold text-rose-700">{item.quantity}</td>
                        <td className="border border-slate-200 px-3 py-2.5 font-mono text-slate-700">{item.system_code}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-slate-500">{item.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Message to admin */}
              {selectedForm.message_to_admin && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                  <span className="font-semibold text-amber-800">پەیام بۆ سوپەرئەدمین: </span>
                  <span className="text-amber-900">{selectedForm.message_to_admin}</span>
                </div>
              )}


            </div>{/* /a4-container */}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* VIEW: Kanban (superadmin only)                                   */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activePage === 'kanban' && isSuperAdmin && (
          <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">کانبانی فۆرمەکان</h2>
              <button onClick={fetchForms}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                نوێکردنەوە
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {STATUS_FLOW.map(key => {
                const cfg = STATUS[key];
                const colForms = forms.filter(f => f.status === key);
                return (
                  <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-800">{cfg.label}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                        {colForms.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {colForms.map(form => (
                        <div key={form.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <p className="font-semibold text-sm text-slate-900">{form.organization}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{form.created_by_email}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{formatDate(form.created_at)}</p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <button onClick={() => openFormDetail(form.id, 'kanban')}
                              className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">
                              بینین
                            </button>
                            {STATUS_FLOW.filter(s => s !== key).map(s => (
                              <button key={s} onClick={() => changeStatus(form.id, s)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${STATUS[s].bg} ${STATUS[s].text}`}>
                                → {STATUS[s].label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      {colForms.length === 0 && (
                        <div className="rounded-2xl border-2 border-dashed border-slate-300 p-5 text-center text-sm text-slate-400">
                          هیچ فۆرمێک نییە
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* VIEW: Items management (superadmin only)                         */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activePage === 'items' && isSuperAdmin && (
          <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-6">زیادکردن و سڕینەوەی کەل و پەل</h2>

            {/* Add form */}
            <div className="mb-8 rounded-2xl border border-violet-200 bg-violet-50 p-5">
              <h3 className="font-semibold text-slate-900 mb-4">زیادکردنی کەل و پەلی نوێ</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block text-sm font-medium text-slate-700">
                  جۆری تۆمار
                  <div className="mt-1.5 flex gap-2">
                    {(['plus', 'minus'] as const).map(cat => (
                      <button key={cat} type="button" onClick={() => setAddCat(cat)}
                        className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                          addCat === cat
                            ? (cat === 'plus' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white')
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}>
                        {cat === 'plus' ? 'زیادە (+)' : 'کەمبوو (-)'}
                      </button>
                    ))}
                  </div>
                </label>
                {[
                  { label: 'جۆری کەل و پەل', val: addType, set: setAddType },
                  { label: 'ناوی کەل و پەل', val: addName, set: setAddName },
                  { label: 'ژمارە',           val: addQty,  set: setAddQty, type: 'number' },
                  ...(addCat === 'minus' ? [{ label: 'کۆدی سیستەم', val: addCode, set: setAddCode }] : []),
                  { label: 'تێبینی', val: addNotes, set: setAddNotes },
                ].map(field => (
                  <label key={field.label} className="block text-sm font-medium text-slate-700">
                    {field.label}
                    <input type={(field as any).type ?? 'text'} value={field.val}
                      onChange={e => field.set(e.target.value)} placeholder="بنووسە..."
                      className="mt-1.5 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                  </label>
                ))}
              </div>
              {itemsMsg && (
                <div className={`mt-4 rounded-2xl p-3 text-sm ${itemsMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                  {itemsMsg.text}
                </div>
              )}
              <button type="button" onClick={handleAddItem} disabled={isAdding}
                className="mt-4 rounded-2xl bg-violet-600 px-6 py-3 font-semibold text-white hover:bg-violet-700 disabled:bg-slate-400 transition">
                {isAdding ? 'چاوەڕوانبکە...' : 'زیادکردن'}
              </button>
            </div>

            {/* Items list */}
            <h3 className="font-semibold text-slate-900 mb-4">هەموو کەل و پەلەکان ({allItems.length})</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-right text-sm">
                <thead>
                  <tr>
                    {['جۆر', 'جۆری کەل و پەل', 'ناوی کەل و پەل', 'ژمارە', 'کۆدی سیستەم', 'تێبینی', 'بەروار', ''].map(h => (
                      <th key={h} className="border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border border-slate-200 p-8 text-center text-slate-400">
                        هیچ کەل و پەلێک نییە.
                      </td>
                    </tr>
                  ) : allItems.map(item => (
                    <tr key={`${item.category}-${item.id}`} className="odd:bg-white even:bg-slate-50">
                      <td className="border border-slate-200 px-3 py-2.5">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.category === 'plus' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {item.category === 'plus' ? 'زیادە' : 'کەمبوو'}
                        </span>
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5">{item.item_type}</td>
                      <td className="border border-slate-200 px-3 py-2.5 font-medium">{item.item_name}</td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center font-bold">{item.quantity}</td>
                      <td className="border border-slate-200 px-3 py-2.5 font-mono text-xs">{item.system_code ?? '—'}</td>
                      <td className="border border-slate-200 px-3 py-2.5 text-slate-500">{item.notes ?? '—'}</td>
                      <td className="border border-slate-200 px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="border border-slate-200 px-3 py-2.5 text-center">
                        <button onClick={() => handleDeleteItem(item.id, item.category)}
                          className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600">
                          سڕینەوە
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
