-- Table client_skills : scores des ancres de carrière par client
CREATE TABLE IF NOT EXISTS public.client_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE UNIQUE,
    score_technique NUMERIC(4,1) DEFAULT 0,
    score_management NUMERIC(4,1) DEFAULT 0,
    score_autonomie NUMERIC(4,1) DEFAULT 0,
    score_securite NUMERIC(4,1) DEFAULT 0,
    score_entrepreneur NUMERIC(4,1) DEFAULT 0,
    score_service NUMERIC(4,1) DEFAULT 0,
    score_defi NUMERIC(4,1) DEFAULT 0,
    score_lifestyle NUMERIC(4,1) DEFAULT 0,
    top_skill_1 TEXT,
    top_skill_2 TEXT,
    top_skill_3 TEXT,
    target_job TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.client_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated users on client_skills" ON public.client_skills
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for authenticated users on client_skills" ON public.client_skills
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users on client_skills" ON public.client_skills
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users on client_skills" ON public.client_skills
    FOR DELETE USING (auth.role() = 'authenticated');
