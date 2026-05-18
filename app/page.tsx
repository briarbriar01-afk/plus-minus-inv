'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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

type AuthMessage = {
  type: 'success' | 'error';
  text: string;
} | null;

type InventoryForm = {
  id: string;
  organization: string;
  created_by_email: string | null;
  status: string;
  created_at: string;
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

const superAdminEmail = process.env.NEXT_PUBLIC_SUPABASE_SUPERADMIN_EMAIL ?? '';

const statusColumns = [
  { key: 'new', label: 'نوێ' },
  { key: 'sent', label: 'ناردراو' },
  { key: 'reviewed', label: 'هەڵسەنگاندن' },
  { key: 'completed', label: 'تەواو' },
];

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

const initialForm = {
  organization: '',
  rows: [defaultRow('plus')],
  messageToAdmin: '',
};

export default function HomePage() {
  const [user, setUser] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState<AuthMessage>(null);
  const [formState, setFormState] = useState(initialForm as typeof initialForm);
  const [statusMessage, setStatusMessage] = useState<AuthMessage>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [forms, setForms] = useState<InventoryForm[]>([]);
  const [activePage, setActivePage] = useState<'form' | 'myForms' | 'kanban' | 'items'>('form');

  // Add-Delete page state
  const [allItems, setAllItems] = useState<AllItem[]>([]);
  const [addItemCategory, setAddItemCategory] = useState<ItemCategory>('plus');
  const [addItemType, setAddItemType] = useState('');
  const [addItemName, setAddItemName] = useState('');
  const [addItemQuantity, setAddItemQuantity] = useState('');
  const [addItemSystemCode, setAddItemSystemCode] = useState('');
  const [addItemNotes, setAddItemNotes] = useState('');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [itemsMessage, setItemsMessage] = useState<AuthMessage>(null);

  const isSuperAdmin =
    Boolean(user?.email) && user?.email?.toLowerCase() === superAdminEmail.toLowerCase();

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ?? null);
      setLoadingAuth(false);
    };

    loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => authListener?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchForms();
    }
  }, [user, activePage, isSuperAdmin]);

  useEffect(() => {
    if (user && activePage === 'items') {
      fetchAllItems();
    }
  }, [user, activePage]);

  const handleAuth = async () => {
    setAuthMessage(null);

    if (!email.trim() || !password.trim()) {
      setAuthMessage({ type: 'error', text: 'تکایە ئیمەیڵ و تێپەڕەوشە بنووسە.' });
      return;
    }

    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthMessage({ type: 'error', text: error.message });
        return;
      }
      setAuthMessage({ type: 'success', text: 'چوونە ژوورەوە سەرکەوتوو بوو.' });
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setAuthMessage({ type: 'error', text: error.message });
        return;
      }
      setAuthMessage({
        type: 'success',
        text: 'تکایە پەیامی ئیمەیڵەکەت بگورە بۆ چالاککردنی ئەکاونت.',
      });
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setFormState(initialForm as typeof initialForm);
    setForms([]);
    setActivePage('form');
  };

  const fetchForms = async () => {
    if (!user) return;

    let query = supabase
      .from('inventory_forms')
      .select('id,organization,created_by_email,status,created_at')
      .order('created_at', { ascending: false });

    if (!isSuperAdmin) {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query;
    if (error) {
      console.error(error.message);
      return;
    }

    setForms(data ?? []);
  };

  const fetchAllItems = async () => {
    const [plusResult, minusResult] = await Promise.all([
      supabase
        .from('plus_items')
        .select('id, form_id, item_type, item_name, quantity, notes, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('minus_items')
        .select('id, form_id, item_type, item_name, quantity, notes, system_code, created_at')
        .order('created_at', { ascending: false }),
    ]);

    const plusItems: AllItem[] = (plusResult.data ?? []).map((item) => ({
      ...item,
      category: 'plus' as const,
    }));
    const minusItems: AllItem[] = (minusResult.data ?? []).map((item) => ({
      ...item,
      category: 'minus' as const,
    }));

    const combined = [...plusItems, ...minusItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setAllItems(combined);
  };

  const handleAddDirectItem = async () => {
    if (!addItemType.trim() || !addItemName.trim()) {
      setItemsMessage({ type: 'error', text: 'تکایە جۆر و ناوی کەل و پەل بنووسە.' });
      return;
    }
    const qty = Number(addItemQuantity);
    if (!addItemQuantity || isNaN(qty) || qty <= 0) {
      setItemsMessage({ type: 'error', text: 'ژمارەی کەل و پەل دەبێت ژمارەیەکی دروست بێت.' });
      return;
    }
    if (addItemCategory === 'minus' && !addItemSystemCode.trim()) {
      setItemsMessage({ type: 'error', text: 'تکایە کۆدی سیستەم بۆ کەمبوو بنووسە.' });
      return;
    }

    setIsAddingItem(true);
    setItemsMessage(null);

    try {
      const { data: formRecord, error: formError } = await supabase
        .from('inventory_forms')
        .insert([{
          organization: 'ڕاستەوخۆ',
          created_by: user.id,
          created_by_email: user.email,
          status: 'completed',
          message_to_admin: null,
        }])
        .select('id')
        .single();

      if (formError || !formRecord) throw formError ?? new Error('هەڵەیەک ڕوویدا');

      if (addItemCategory === 'plus') {
        const { error } = await supabase.from('plus_items').insert([{
          form_id: formRecord.id,
          item_type: addItemType,
          item_name: addItemName,
          quantity: qty,
          notes: addItemNotes || null,
          image_path: null,
        }]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('minus_items').insert([{
          form_id: formRecord.id,
          item_type: addItemType,
          item_name: addItemName,
          quantity: qty,
          system_code: addItemSystemCode,
          notes: addItemNotes || null,
        }]);
        if (error) throw error;
      }

      setItemsMessage({ type: 'success', text: 'کەل و پەل بە سەرکەوتوویی زیادکرا.' });
      setAddItemType('');
      setAddItemName('');
      setAddItemQuantity('');
      setAddItemSystemCode('');
      setAddItemNotes('');
      fetchAllItems();
    } catch (err) {
      setItemsMessage({ type: 'error', text: `هەڵەیەک ڕوویدا: ${(err as Error).message}` });
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleDeleteItem = async (id: string, category: ItemCategory) => {
    const table = category === 'plus' ? 'plus_items' : 'minus_items';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      setItemsMessage({ type: 'error', text: `هەڵەیەک ڕوویدا: ${error.message}` });
      return;
    }
    setItemsMessage({ type: 'success', text: 'کەل و پەل سڕایەوە.' });
    fetchAllItems();
  };

  const validateForm = () => {
    if (!formState.organization.trim()) {
      return 'تکایە ناوی ئۆرگان بنووسە.';
    }

    if (formState.rows.length === 0) {
      return 'تکایە یەک ریزە زیاد بکە.';
    }

    for (const row of formState.rows) {
      if (!row.itemType.trim()) {
        return 'تکایە جۆری کەل و پەل دیاری بکە.';
      }
      if (!row.itemName.trim()) {
        return 'تکایە ناوی کەل و پەل بنووسە.';
      }
      const quantity = Number(row.quantity);
      if (!row.quantity || Number.isNaN(quantity) || quantity <= 0) {
        return 'ژمارەی کەل و پەل دەبێت ژمارەیەکی دروست بێت.';
      }
      if (row.category === 'minus' && !row.systemCode.trim()) {
        return 'تکایە کۆدی سیستەم بۆ کەمبوو بنووسە.';
      }
    }

    return null;
  };

  const uploadImage = async (file: File) => {
    const filePath = `inventory_images/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('inventory_images')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    if (error) {
      throw new Error(error.message);
    }

    return data.path;
  };

  const persistForm = async (status: string) => {
    if (!user) {
      setStatusMessage({ type: 'error', text: 'تکایە بچوونە ژوورەوە بۆ پاشەکەوتکردن.' });
      return null;
    }

    const { data: formRecord, error: formError } = await supabase
      .from('inventory_forms')
      .insert([
        {
          organization: formState.organization,
          created_by: user.id,
          created_by_email: user.email,
          status,
          message_to_admin: formState.messageToAdmin,
        },
      ])
      .select('id')
      .single();

    if (formError || !formRecord) {
      throw formError ?? new Error('تۆمارکردنی فۆرم سەرکەوتنەبوو');
    }

    return formRecord.id;
  };

  const handleSave = async () => {
    const errorMessage = validateForm();
    if (errorMessage) {
      setStatusMessage({ type: 'error', text: errorMessage });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const formId = await persistForm('new');
      if (!formId) return;

      const plusRows = formState.rows.filter((row) => row.category === 'plus');
      const minusRows = formState.rows.filter((row) => row.category === 'minus');

      if (plusRows.length > 0) {
        const payload = await Promise.all(
          plusRows.map(async (row) => {
            const imagePath = row.image ? await uploadImage(row.image) : null;
            return {
              form_id: formId,
              item_type: row.itemType,
              item_name: row.itemName,
              quantity: Number(row.quantity),
              notes: row.notes,
              image_path: imagePath,
            };
          })
        );

        const { error: plusError } = await supabase.from('plus_items').insert(payload);
        if (plusError) throw plusError;
      }

      if (minusRows.length > 0) {
        const payload = minusRows.map((row) => ({
          form_id: formId,
          item_type: row.itemType,
          item_name: row.itemName,
          quantity: Number(row.quantity),
          system_code: row.systemCode,
          notes: row.notes,
        }));

        const { error: minusError } = await supabase.from('minus_items').insert(payload);
        if (minusError) throw minusError;
      }

      setStatusMessage({ type: 'success', text: 'فۆرم بە سەرکەوتوویی پاشەکەوت کرا.' });
      setFormState(initialForm as typeof initialForm);
      fetchForms();
    } catch (error) {
      setStatusMessage({ type: 'error', text: `هەڵەیەک ڕوویدا: ${(error as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async () => {
    const errorMessage = validateForm();
    if (errorMessage) {
      setStatusMessage({ type: 'error', text: errorMessage });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const formId = await persistForm('sent');
      if (!formId) return;

      const plusRows = formState.rows.filter((row) => row.category === 'plus');
      const minusRows = formState.rows.filter((row) => row.category === 'minus');

      if (plusRows.length > 0) {
        const payload = await Promise.all(
          plusRows.map(async (row) => {
            const imagePath = row.image ? await uploadImage(row.image) : null;
            return {
              form_id: formId,
              item_type: row.itemType,
              item_name: row.itemName,
              quantity: Number(row.quantity),
              notes: row.notes,
              image_path: imagePath,
            };
          })
        );

        const { error: plusError } = await supabase.from('plus_items').insert(payload);
        if (plusError) throw plusError;
      }

      if (minusRows.length > 0) {
        const payload = minusRows.map((row) => ({
          form_id: formId,
          item_type: row.itemType,
          item_name: row.itemName,
          quantity: Number(row.quantity),
          system_code: row.systemCode,
          notes: row.notes,
        }));

        const { error: minusError } = await supabase.from('minus_items').insert(payload);
        if (minusError) throw minusError;
      }

      setStatusMessage({ type: 'success', text: 'فۆرم بەسەرکەوتوویی بۆ سوپەرئەدمین ناردرا.' });
      setFormState(initialForm as typeof initialForm);
      fetchForms();
    } catch (error) {
      setStatusMessage({ type: 'error', text: `هەڵەیەک ڕوویدا: ${(error as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setFormState(initialForm as typeof initialForm);
    setStatusMessage(null);
  };

  const handlePrint = () => {
    window.print();
  };

  const addRow = (category: ItemCategory) => {
    setFormState((prev) => ({
      ...prev,
      rows: [...prev.rows, defaultRow(category)],
    }));
  };

  const updateRow = (id: string, changes: Partial<ItemRow>) => {
    setFormState((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    }));
  };

  const removeRow = (id: string) => {
    setFormState((prev) => ({
      ...prev,
      rows: prev.rows.filter((row) => row.id !== id),
    }));
  };

  const changeFormStatus = async (formId: string, nextStatus: string) => {
    const { error } = await supabase
      .from('inventory_forms')
      .update({ status: nextStatus })
      .eq('id', formId);

    if (error) {
      console.error(error.message);
      return;
    }

    fetchForms();
  };

  const filteredForms = (status: string) => forms.filter((form) => form.status === status);

  const printPlusRows = formState.rows.filter((row) => row.category === 'plus');
  const printMinusRows = formState.rows.filter((row) => row.category === 'minus');

  const title = useMemo(
    () => 'فۆرمی تۆمارکردنی جیاوازییەکانی جەرد',
    []
  );

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-700">
        <div className="rounded-3xl border border-slate-300 bg-white p-8 shadow-paper">چاوەڕوانکردنی دەستپێکردن...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
        <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-paper rtl">
          <h1 className="text-xl font-semibold text-slate-900 mb-4">چوونە ژوورەوە یان دروستکردن</h1>
          <div className="grid gap-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  authMode === 'login' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                چوونە ژوورەوە
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('signup')}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  authMode === 'signup' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                دروستکردنی ئەکاونت
              </button>
            </div>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              ئیمەیڵ
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              تێپەڕەوشە
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            {authMessage ? (
              <div className={`rounded-3xl p-3 text-sm font-medium ${
                authMessage.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {authMessage.text}
              </div>
            ) : null}
            <button
              type="button"
              onClick={handleAuth}
              className="rounded-3xl bg-sky-600 px-5 py-3 text-white transition hover:bg-sky-700"
            >
              {authMode === 'login' ? 'چوونە ژوورەوە' : 'دروستکردنی ئەکاونت'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:p-0 print:bg-white">
      <div className="mx-auto w-full max-w-[1200px] rtl">
        <header className="mb-6 rounded-[30px] border border-slate-200 bg-white p-6 shadow-paper print:hidden">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-slate-500">فۆرمی جیاوازییەکانی جەرد</p>
              <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
              <p className="mt-2 text-sm text-slate-600">ئەم وێب ئەپە بۆ کارمەند و سوپێرڤایزەرە.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-3xl bg-slate-100 px-4 py-3 text-slate-700">
                {user.email}
                <div className="text-xs text-slate-500">{isSuperAdmin ? 'سوپێر ئەدمین' : 'کارمەند'}</div>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="rounded-3xl bg-rose-600 px-5 py-3 text-white transition hover:bg-rose-700"
              >
                دەرچوون
              </button>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
          <button
            type="button"
            onClick={() => setActivePage('form')}
            className={`rounded-3xl border px-5 py-4 text-right shadow-sm transition ${
              activePage === 'form' ? 'border-sky-500 bg-sky-50 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            <h2 className="text-base font-semibold">فۆرمی تازە</h2>
            <p className="text-sm text-slate-500">کەل و پەلی زیادە یان کەمبوو تۆمار بکە.</p>
          </button>
          <button
            type="button"
            onClick={() => setActivePage('myForms')}
            className={`rounded-3xl border px-5 py-4 text-right shadow-sm transition ${
              activePage === 'myForms' ? 'border-sky-500 bg-sky-50 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            <h2 className="text-base font-semibold">فۆرمەکانی من</h2>
            <p className="text-sm text-slate-500">فۆرمەکانی تۆ ببینە.</p>
          </button>
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={() => setActivePage('kanban')}
              className={`rounded-3xl border px-5 py-4 text-right shadow-sm transition ${
                activePage === 'kanban' ? 'border-sky-500 bg-sky-50 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <h2 className="text-base font-semibold">کانبان</h2>
              <p className="text-sm text-slate-500">هەموو فۆرمەکان ببینە.</p>
            </button>
          ) : null}
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={() => setActivePage('items')}
              className={`rounded-3xl border px-5 py-4 text-right shadow-sm transition ${
                activePage === 'items' ? 'border-violet-500 bg-violet-50 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <h2 className="text-base font-semibold">زیادکردن و سڕینەوە</h2>
              <p className="text-sm text-slate-500">ڕاستەوخۆ کەل و پەل زیاد بکە یان بیسڕەوە.</p>
            </button>
          ) : null}
        </section>

        <div className="hidden print:block">
          <div className="rounded-[20px] border border-slate-300 bg-white p-6">
            <h2 className="text-2xl font-semibold text-slate-900">فۆرمی تۆماری کەل و پەلی جیاوازی</h2>
            <p className="mt-4 text-lg font-medium text-slate-700">ناوی ئۆرگان: {formState.organization || '---'}</p>

            <div className="mt-6">
              <h3 className="mb-3 text-lg font-semibold text-slate-900">کەل و پەلی زیادە</h3>
              <table className="min-w-full border-separate border-spacing-0 text-right">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="border border-slate-300 p-3">جۆری کەل و پەل</th>
                    <th className="border border-slate-300 p-3">ناوی کەل و پەل</th>
                    <th className="border border-slate-300 p-3">ژمارە</th>
                    <th className="border border-slate-300 p-3">وێنە</th>
                    <th className="border border-slate-300 p-3">تێبینی</th>
                  </tr>
                </thead>
                <tbody>
                  {printPlusRows.map((row) => (
                    <tr key={row.id} className="even:bg-white odd:bg-slate-50">
                      <td className="border border-slate-300 p-2">{row.itemType}</td>
                      <td className="border border-slate-300 p-2">{row.itemName}</td>
                      <td className="border border-slate-300 p-2">{row.quantity}</td>
                      <td className="border border-slate-300 p-2">
                        {row.imageUrl ? (
                          <img src={row.imageUrl} alt="Preview" className="mx-auto h-24 w-auto object-contain" />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="border border-slate-300 p-2">{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <h3 className="mb-3 text-lg font-semibold text-slate-900">کەل و پەلی کەمبوو</h3>
              <table className="min-w-full border-separate border-spacing-0 text-right">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="border border-slate-300 p-3">جۆری کەل و پەل</th>
                    <th className="border border-slate-300 p-3">ناوی کەل و پەل</th>
                    <th className="border border-slate-300 p-3">ژمارە</th>
                    <th className="border border-slate-300 p-3">کۆدی سیستەم</th>
                    <th className="border border-slate-300 p-3">تێبینی</th>
                  </tr>
                </thead>
                <tbody>
                  {printMinusRows.map((row) => (
                    <tr key={row.id} className="even:bg-white odd:bg-slate-50">
                      <td className="border border-slate-300 p-2">{row.itemType}</td>
                      <td className="border border-slate-300 p-2">{row.itemName}</td>
                      <td className="border border-slate-300 p-2">{row.quantity}</td>
                      <td className="border border-slate-300 p-2">{row.systemCode}</td>
                      <td className="border border-slate-300 p-2">{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {activePage === 'form' ? (
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-paper print:hidden">
            <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-sm text-slate-500">سەروویی فۆرم</p>
                <h2 className="text-2xl font-semibold text-slate-900">فۆرمی تۆمارکردنی کەل و پەلی جیاوازی</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => addRow('plus')}
                  className="rounded-3xl bg-emerald-600 px-5 py-3 text-white transition hover:bg-emerald-700"
                >
                  زیادکردنی ڕیزەی (+)
                </button>
                <button
                  type="button"
                  onClick={() => addRow('minus')}
                  className="rounded-3xl bg-rose-600 px-5 py-3 text-white transition hover:bg-rose-700"
                >
                  زیادکردنی ڕیزەی (-)
                </button>
              </div>
            </div>

            <div className="grid gap-4">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                ناوی ئۆرگان
                <input
                  type="text"
                  value={formState.organization}
                  onChange={(e) => setFormState((prev) => ({ ...prev, organization: e.target.value }))}
                  placeholder="ناوی ئۆرگان"
                  className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                پەیامی ناردن بە سوپەرئەدمین (ئەگەر نیوەیەتی پێویست بیت)
                <textarea
                  rows={3}
                  value={formState.messageToAdmin}
                  onChange={(e) => setFormState((prev) => ({ ...prev, messageToAdmin: e.target.value }))}
                  className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="پەیامێکت بنووسە"
                />
              </label>

              <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">کەل و پەلی زیادە</h3>
                <table className="min-w-full border-separate border-spacing-0 text-right">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600">
                      <th className="border border-slate-200 p-3">جۆری کەل و پەل</th>
                      <th className="border border-slate-200 p-3">ناوی کەل و پەل</th>
                      <th className="border border-slate-200 p-3">ژمارە</th>
                      <th className="border border-slate-200 p-3">وێنە</th>
                      <th className="border border-slate-200 p-3">تێبینی</th>
                      <th className="border border-slate-200 p-3">سڕینەوە</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formState.rows.filter((row) => row.category === 'plus').map((row) => (
                      <tr key={row.id} className="even:bg-white odd:bg-slate-50">
                        <td className="border border-slate-200 p-2">
                          <input
                            type="text"
                            value={row.itemType}
                            onChange={(e) => updateRow(row.id, { itemType: e.target.value })}
                            className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          />
                        </td>
                        <td className="border border-slate-200 p-2">
                          <input
                            type="text"
                            value={row.itemName}
                            onChange={(e) => updateRow(row.id, { itemName: e.target.value })}
                            className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          />
                        </td>
                        <td className="border border-slate-200 p-2">
                          <input
                            type="number"
                            min={0}
                            value={row.quantity}
                            onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                            className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          />
                        </td>
                        <td className="border border-slate-200 p-2">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              const imageUrl = file ? URL.createObjectURL(file) : '';
                              updateRow(row.id, { image: file, imageUrl });
                            }}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-slate-700 outline-none file:mr-4 file:rounded-full file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-slate-700"
                          />
                          {row.imageUrl ? (
                            <img src={row.imageUrl} alt="preview" className="mt-2 h-24 w-full rounded-xl object-contain" />
                          ) : null}
                        </td>
                        <td className="border border-slate-200 p-2">
                          <input
                            type="text"
                            value={row.notes}
                            onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                            className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          />
                        </td>
                        <td className="border border-slate-200 p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="rounded-2xl bg-rose-500 px-4 py-2 text-white transition hover:bg-rose-600"
                          >
                            سڕینەوە
                          </button>
                        </td>
                      </tr>
                    ))}
                    {formState.rows.filter((row) => row.category === 'plus').length === 0 ? (
                      <tr>
                        <td colSpan={6} className="border border-slate-200 p-4 text-center text-slate-500">
                          هیچ کەل و پەلی زیادە نەدروستکراوە.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">کەل و پەلی کەمبوو</h3>
                <table className="min-w-full border-separate border-spacing-0 text-right">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600">
                      <th className="border border-slate-200 p-3">جۆری کەل و پەل</th>
                      <th className="border border-slate-200 p-3">ناوی کەل و پەل</th>
                      <th className="border border-slate-200 p-3">ژمارە</th>
                      <th className="border border-slate-200 p-3">کۆدی سیستەم</th>
                      <th className="border border-slate-200 p-3">تێبینی</th>
                      <th className="border border-slate-200 p-3">سڕینەوە</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formState.rows.filter((row) => row.category === 'minus').map((row) => (
                      <tr key={row.id} className="even:bg-white odd:bg-slate-50">
                        <td className="border border-slate-200 p-2">
                          <input
                            type="text"
                            value={row.itemType}
                            onChange={(e) => updateRow(row.id, { itemType: e.target.value })}
                            className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          />
                        </td>
                        <td className="border border-slate-200 p-2">
                          <input
                            type="text"
                            value={row.itemName}
                            onChange={(e) => updateRow(row.id, { itemName: e.target.value })}
                            className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          />
                        </td>
                        <td className="border border-slate-200 p-2">
                          <input
                            type="number"
                            min={0}
                            value={row.quantity}
                            onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                            className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          />
                        </td>
                        <td className="border border-slate-200 p-2">
                          <input
                            type="text"
                            value={row.systemCode}
                            onChange={(e) => updateRow(row.id, { systemCode: e.target.value })}
                            className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          />
                        </td>
                        <td className="border border-slate-200 p-2">
                          <input
                            type="text"
                            value={row.notes}
                            onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                            className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          />
                        </td>
                        <td className="border border-slate-200 p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="rounded-2xl bg-rose-500 px-4 py-2 text-white transition hover:bg-rose-600"
                          >
                            سڕینەوە
                          </button>
                        </td>
                      </tr>
                    ))}
                    {formState.rows.filter((row) => row.category === 'minus').length === 0 ? (
                      <tr>
                        <td colSpan={6} className="border border-slate-200 p-4 text-center text-slate-500">
                          هیچ کەل و پەلی کەمبوو نەدروستکراوە.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {statusMessage ? (
                <div className={`rounded-3xl p-4 text-sm font-medium ${
                  statusMessage.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {statusMessage.text}
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-slate-600">
                  فۆرمەکەت تکایە پڕبکە و دواتر پاشەکەوت یان ناردن بکە.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="rounded-3xl bg-sky-600 px-5 py-3 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  پاشەکەوتکردن
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isSaving}
                  className="rounded-3xl bg-emerald-600 px-5 py-3 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  ناردن بۆ سوپەرئەدمین
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-3xl border border-slate-300 bg-white px-5 py-3 text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  سڕینەوە
                </button>
              </div>

              <div className="mt-4 text-right">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="rounded-3xl bg-slate-900 px-5 py-3 text-white transition hover:bg-slate-700 print:hidden"
                >
                  چاپکردن
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activePage === 'myForms' ? (
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-paper print:hidden">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">فۆرمەکانی من</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-right">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="border border-slate-200 p-3">ئۆرگان</th>
                    <th className="border border-slate-200 p-3">ئیمەیڵ</th>
                    <th className="border border-slate-200 p-3">ئاست</th>
                    <th className="border border-slate-200 p-3">کاتژمێر</th>
                  </tr>
                </thead>
                <tbody>
                  {forms.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="border border-slate-200 p-4 text-center text-slate-500">
                        تا ئێستا هیچ فۆرمێک دروست نەکراوە.
                      </td>
                    </tr>
                  ) : (
                    forms.map((form) => (
                      <tr key={form.id} className="even:bg-white odd:bg-slate-50">
                        <td className="border border-slate-200 p-3">{form.organization}</td>
                        <td className="border border-slate-200 p-3">{form.created_by_email}</td>
                        <td className="border border-slate-200 p-3">{form.status}</td>
                        <td className="border border-slate-200 p-3">{new Date(form.created_at).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activePage === 'kanban' && isSuperAdmin ? (
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-paper print:hidden">
            <h2 className="mb-6 text-2xl font-semibold text-slate-900">کانبان</h2>
            <div className="grid gap-4 xl:grid-cols-4">
              {statusColumns.map((column) => (
                <div key={column.key} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">{column.label}</h3>
                  <div className="space-y-4">
                    {filteredForms(column.key).map((form) => (
                      <div key={form.id} className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
                        <div className="mb-3 text-sm text-slate-500">{form.created_by_email}</div>
                        <h4 className="text-base font-semibold text-slate-900">{form.organization}</h4>
                        <p className="mt-2 text-sm text-slate-600">{new Date(form.created_at).toLocaleString()}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {statusColumns
                            .filter((item) => item.key !== column.key)
                            .map((item) => (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => changeFormStatus(form.id, item.key)}
                                className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                              >
                                بگۆڕە بۆ {item.label}
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                    {filteredForms(column.key).length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                        هیچ فۆرمێک نییە.
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activePage === 'items' && isSuperAdmin ? (
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-paper print:hidden">
            <h2 className="mb-6 text-2xl font-semibold text-slate-900">زیادکردن و سڕینەوەی کەل و پەل</h2>

            {/* Add item form */}
            <div className="mb-8 rounded-3xl border border-violet-200 bg-violet-50 p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">زیادکردنی کەل و پەلی نوێ</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  جۆری تۆمار
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setAddItemCategory('plus')}
                      className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                        addItemCategory === 'plus' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      زیادە (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddItemCategory('minus')}
                      className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                        addItemCategory === 'minus' ? 'bg-rose-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      کەمبوو (-)
                    </button>
                  </div>
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  جۆری کەل و پەل
                  <input
                    type="text"
                    value={addItemType}
                    onChange={(e) => setAddItemType(e.target.value)}
                    placeholder="بنووسە..."
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  ناوی کەل و پەل
                  <input
                    type="text"
                    value={addItemName}
                    onChange={(e) => setAddItemName(e.target.value)}
                    placeholder="بنووسە..."
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  ژمارە
                  <input
                    type="number"
                    min={1}
                    value={addItemQuantity}
                    onChange={(e) => setAddItemQuantity(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                </label>

                {addItemCategory === 'minus' ? (
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    کۆدی سیستەم
                    <input
                      type="text"
                      value={addItemSystemCode}
                      onChange={(e) => setAddItemSystemCode(e.target.value)}
                      placeholder="بنووسە..."
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    />
                  </label>
                ) : null}

                <label className="space-y-2 text-sm font-medium text-slate-700">
                  تێبینی
                  <input
                    type="text"
                    value={addItemNotes}
                    onChange={(e) => setAddItemNotes(e.target.value)}
                    placeholder="بنووسە..."
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                </label>
              </div>

              {itemsMessage ? (
                <div className={`mt-4 rounded-3xl p-3 text-sm font-medium ${
                  itemsMessage.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {itemsMessage.text}
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleAddDirectItem}
                disabled={isAddingItem}
                className="mt-4 rounded-3xl bg-violet-600 px-6 py-3 text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isAddingItem ? 'چاوەڕوانبکە...' : 'زیادکردن'}
              </button>
            </div>

            {/* Items list */}
            <h3 className="mb-4 text-lg font-semibold text-slate-900">هەموو کەل و پەلەکان</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-right">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="border border-slate-200 p-3">جۆر</th>
                    <th className="border border-slate-200 p-3">جۆری کەل و پەل</th>
                    <th className="border border-slate-200 p-3">ناوی کەل و پەل</th>
                    <th className="border border-slate-200 p-3">ژمارە</th>
                    <th className="border border-slate-200 p-3">کۆدی سیستەم</th>
                    <th className="border border-slate-200 p-3">تێبینی</th>
                    <th className="border border-slate-200 p-3">کاتژمێر</th>
                    <th className="border border-slate-200 p-3">سڕینەوە</th>
                  </tr>
                </thead>
                <tbody>
                  {allItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border border-slate-200 p-4 text-center text-slate-500">
                        هیچ کەل و پەلێک نییە.
                      </td>
                    </tr>
                  ) : (
                    allItems.map((item) => (
                      <tr key={`${item.category}-${item.id}`} className="even:bg-white odd:bg-slate-50">
                        <td className="border border-slate-200 p-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            item.category === 'plus'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {item.category === 'plus' ? 'زیادە (+)' : 'کەمبوو (-)'}
                          </span>
                        </td>
                        <td className="border border-slate-200 p-3">{item.item_type}</td>
                        <td className="border border-slate-200 p-3">{item.item_name}</td>
                        <td className="border border-slate-200 p-3">{item.quantity}</td>
                        <td className="border border-slate-200 p-3">{item.system_code ?? '—'}</td>
                        <td className="border border-slate-200 p-3">{item.notes ?? '—'}</td>
                        <td className="border border-slate-200 p-3 text-sm text-slate-500">
                          {new Date(item.created_at).toLocaleString()}
                        </td>
                        <td className="border border-slate-200 p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id, item.category)}
                            className="rounded-2xl bg-rose-500 px-4 py-2 text-white transition hover:bg-rose-600"
                          >
                            سڕینەوە
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
