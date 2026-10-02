'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Company } from '@/types';

interface CompanySelectProps {
  /** companies.id selecionada ('' = nenhuma). */
  value: string;
  /** Devolve o id e o nome (para manter o texto legado contacts.company). */
  onChange: (id: string, nome: string) => void;
  className?: string;
}

/** Seletor de empresa com "Criar nova empresa" inline. */
export function CompanySelect({ value, onChange, className }: CompanySelectProps) {
  const supabase = createClient();
  const { accountId, user } = useAuth();
  const [empresas, setEmpresas] = useState<Pick<Company, 'id' | 'name'>[]>([]);
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('companies').select('id,name').order('name');
    setEmpresas(data ?? []);
  }, [supabase]);

  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  async function criar() {
    const nome = novoNome.trim();
    if (!nome) return;
    if (!accountId) return toast.error('Seu perfil não está vinculado a uma conta.');
    setSalvando(true);
    const { data, error } = await supabase
      .from('companies')
      .insert({ account_id: accountId, user_id: user?.id ?? null, name: nome })
      .select('id,name')
      .single();
    setSalvando(false);
    if (error) {
      if (error.code === '23505') {
        // já existe com esse nome: seleciona a existente
        const existente = empresas.find((e) => e.name.toLowerCase() === nome.toLowerCase());
        if (existente) {
          onChange(existente.id, existente.name);
          setCriando(false);
          setNovoNome('');
          return;
        }
        return toast.error('Já existe uma empresa com esse nome.');
      }
      return toast.error('Não foi possível criar a empresa.');
    }
    setEmpresas((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    onChange(data.id, data.name);
    setCriando(false);
    setNovoNome('');
    toast.success('Empresa criada');
  }

  return (
    <div className={className}>
      <select
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          onChange(id, empresas.find((x) => x.id === id)?.name ?? '');
        }}
        className="h-8 w-full rounded-md border border-border bg-muted px-2 text-sm text-foreground"
      >
        <option value="">Sem empresa</option>
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      {criando ? (
        <div className="mt-2 flex gap-2">
          <Input
            autoFocus
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                criar();
              }
            }}
            placeholder="Nome da nova empresa"
            className="h-8 border-border bg-muted text-sm text-foreground"
          />
          <Button type="button" size="sm" disabled={salvando || !novoNome.trim()} onClick={criar}>
            {salvando && <Loader2 className="size-3.5 animate-spin" />} Criar
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setCriando(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus className="size-3" /> Criar nova empresa
        </button>
      )}
    </div>
  );
}
