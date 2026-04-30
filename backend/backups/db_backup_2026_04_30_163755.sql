--
-- PostgreSQL database dump
--

\restrict dspqiVILEnrBFfsWpzs8BA7Jwxt8iPlZqtbyyZfCRWAL49KsvX2ZdSVtZcqVreQ

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id bigint NOT NULL,
    user_id bigint,
    level character varying(20) DEFAULT 'INFO'::character varying,
    source character varying(50) DEFAULT 'System'::character varying,
    event character varying(255),
    message text,
    ip character varying(45),
    identifier character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: activity_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_logs_id_seq OWNED BY public.activity_logs.id;


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    key_prefix character varying(16),
    api_key character varying(255),
    key character varying(255) NOT NULL,
    name character varying(100) DEFAULT 'Default Key'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    last_used timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: api_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_keys_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_keys_id_seq OWNED BY public.api_keys.id;


--
-- Name: deleted_job_daily_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deleted_job_daily_stats (
    user_id bigint NOT NULL,
    activity_date date NOT NULL,
    emails bigint DEFAULT 0,
    jobs bigint DEFAULT 0,
    updated_at timestamp with time zone
);


--
-- Name: deleted_job_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deleted_job_stats (
    user_id bigint NOT NULL,
    total_verifications bigint DEFAULT 0,
    total_jobs bigint DEFAULT 0,
    deliverable bigint DEFAULT 0,
    risky bigint DEFAULT 0,
    undeliverable bigint DEFAULT 0,
    catch_all bigint DEFAULT 0,
    disposable bigint DEFAULT 0,
    invalid_syntax bigint DEFAULT 0,
    role_accounts bigint DEFAULT 0,
    updated_at timestamp with time zone
);


--
-- Name: deleted_job_stats_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deleted_job_stats_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deleted_job_stats_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.deleted_job_stats_user_id_seq OWNED BY public.deleted_job_stats.user_id;


--
-- Name: domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.domains (
    id bigint NOT NULL,
    domain character varying(255) NOT NULL,
    type character varying(50) DEFAULT 'disposable'::character varying NOT NULL,
    excluded boolean DEFAULT false NOT NULL,
    added_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone
);


--
-- Name: domains_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.domains_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: domains_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.domains_id_seq OWNED BY public.domains.id;


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id bigint NOT NULL,
    template_name character varying(100) NOT NULL,
    subject character varying(255),
    body text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: email_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_templates_id_seq OWNED BY public.email_templates.id;


--
-- Name: job_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_results (
    id bigint NOT NULL,
    job_internal_id bigint,
    email character varying(255) NOT NULL,
    status character varying(50) NOT NULL,
    score bigint DEFAULT 0,
    reason character varying(100),
    is_disposable boolean DEFAULT false,
    is_free boolean DEFAULT false,
    is_role boolean DEFAULT false,
    has_mx boolean DEFAULT false,
    smtp_connect boolean DEFAULT false,
    user_exists boolean DEFAULT false,
    is_catch_all boolean DEFAULT false,
    is_deliverable boolean DEFAULT false,
    is_syntax_valid boolean DEFAULT false,
    is_spam_trap boolean DEFAULT false,
    is_blacklisted boolean DEFAULT false,
    mailbox_full boolean DEFAULT false,
    processing_time numeric(10,3),
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    job_id bigint
);


--
-- Name: job_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_results_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_results_id_seq OWNED BY public.job_results.id;


--
-- Name: job_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_tasks (
    id bigint NOT NULL,
    job_id character varying(50) NOT NULL,
    start_index bigint NOT NULL,
    end_index bigint NOT NULL,
    pushed_count bigint DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'queued'::character varying,
    worker_server character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: job_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_tasks_id_seq OWNED BY public.job_tasks.id;


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    job_id character varying(50) NOT NULL,
    email character varying(255),
    filename character varying(255),
    file_url character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    type character varying(20) DEFAULT 'bulk'::character varying,
    total_emails bigint DEFAULT 0,
    processed_count bigint DEFAULT 0,
    deliverable bigint DEFAULT 0,
    risky bigint DEFAULT 0,
    undeliverable bigint DEFAULT 0,
    catch_all bigint DEFAULT 0,
    invalid_syntax bigint DEFAULT 0,
    role_accounts bigint DEFAULT 0,
    disposable bigint DEFAULT 0,
    verified_count bigint DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone
);


--
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;


--
-- Name: packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packages (
    id bigint NOT NULL,
    name character varying(100),
    tagline character varying(255),
    credits_amount bigint NOT NULL,
    price numeric(10,2) NOT NULL,
    description text,
    features text,
    status character varying(20) DEFAULT 'active'::character varying,
    popular boolean DEFAULT false,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: packages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.packages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: packages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.packages_id_seq OWNED BY public.packages.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version bigint NOT NULL,
    dirty boolean NOT NULL
);


--
-- Name: security_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_logs (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    severity character varying(20) NOT NULL,
    module character varying(50) NOT NULL,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: security_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_logs_id_seq OWNED BY public.security_logs.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id bigint NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone
);


--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;


--
-- Name: smtp_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smtp_configs (
    id bigint NOT NULL,
    host character varying(255),
    port bigint DEFAULT 587,
    username character varying(255),
    password text,
    encryption character varying(10) DEFAULT 'tls'::character varying,
    daily_limit bigint DEFAULT 5000,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: smtp_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.smtp_configs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: smtp_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.smtp_configs_id_seq OWNED BY public.smtp_configs.id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    transaction_id character varying(100) NOT NULL,
    amount numeric(10,2) NOT NULL,
    credits_added bigint NOT NULL,
    payment_method character varying(100) DEFAULT 'manual'::character varying,
    type character varying(50) DEFAULT 'purchase'::character varying,
    status character varying(20) DEFAULT 'completed'::character varying,
    provider character varying(50) DEFAULT 'system'::character varying,
    package character varying(100),
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'user'::character varying,
    credits bigint DEFAULT 0,
    status character varying(20) DEFAULT 'Active'::character varying,
    webhook_url character varying(255),
    webhook_secret character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: worker_servers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_servers (
    id bigint NOT NULL,
    server_name character varying(100) NOT NULL,
    ip_address character varying(45) NOT NULL,
    port integer DEFAULT 80 NOT NULL,
    auth_token character varying(255),
    ip_reputation character varying(20) DEFAULT 'Good'::character varying,
    rate_limit bigint DEFAULT 100,
    daily_limit bigint DEFAULT 50000,
    worker_count bigint DEFAULT 0,
    emails_verified bigint DEFAULT 0,
    last_ping timestamp with time zone,
    status character varying(20) DEFAULT 'offline'::character varying,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: worker_servers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.worker_servers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: worker_servers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.worker_servers_id_seq OWNED BY public.worker_servers.id;


--
-- Name: activity_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs ALTER COLUMN id SET DEFAULT nextval('public.activity_logs_id_seq'::regclass);


--
-- Name: api_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys ALTER COLUMN id SET DEFAULT nextval('public.api_keys_id_seq'::regclass);


--
-- Name: deleted_job_stats user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deleted_job_stats ALTER COLUMN user_id SET DEFAULT nextval('public.deleted_job_stats_user_id_seq'::regclass);


--
-- Name: domains id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domains ALTER COLUMN id SET DEFAULT nextval('public.domains_id_seq'::regclass);


--
-- Name: email_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates ALTER COLUMN id SET DEFAULT nextval('public.email_templates_id_seq'::regclass);


--
-- Name: job_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_results ALTER COLUMN id SET DEFAULT nextval('public.job_results_id_seq'::regclass);


--
-- Name: job_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_tasks ALTER COLUMN id SET DEFAULT nextval('public.job_tasks_id_seq'::regclass);


--
-- Name: jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);


--
-- Name: packages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages ALTER COLUMN id SET DEFAULT nextval('public.packages_id_seq'::regclass);


--
-- Name: security_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_logs ALTER COLUMN id SET DEFAULT nextval('public.security_logs_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);


--
-- Name: smtp_configs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smtp_configs ALTER COLUMN id SET DEFAULT nextval('public.smtp_configs_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: worker_servers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_servers ALTER COLUMN id SET DEFAULT nextval('public.worker_servers_id_seq'::regclass);


--
-- Data for Name: activity_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.activity_logs (id, user_id, level, source, event, message, ip, identifier, created_at) FROM stdin;
1	1	INFO	Admin		Adjusted 1000 credits for user #1			2026-04-25 12:25:33.694784
2	1	WARN	Admin		Deleted backup file: chats_export_2026_04_24_144844.json			2026-04-25 12:45:06.838544
3	1	INFO	Admin		Generated Database backup: db_backup_2026_04_25_124511.sql			2026-04-25 12:45:13.384818
4	1	WARN	Admin		Administrator revealed the dedicated worker API key			2026-04-25 17:14:53.529741
5	1	INFO	Admin		Changed user #1 role to admin			2026-04-30 16:03:15.555363
6	1	INFO	Admin		Added domain: test-domain.com (free)			2026-04-30 16:08:22.790255
7	1	INFO	Admin		Bulk uploaded domains: added=2 duplicates=1 invalid=1			2026-04-30 16:08:22.815503
8	1	INFO	Admin		System settings updated			2026-04-30 16:11:48.113159
9	1	INFO	Admin		System settings updated			2026-04-30 16:11:48.124456
\.


--
-- Data for Name: api_keys; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.api_keys (id, user_id, key_prefix, api_key, key, name, status, last_used_at, expires_at, created_at, deleted_at, last_used, updated_at) FROM stdin;
1	1	ak_live_123ceaea	$2a$14$d1Mg1DHk5OmPlu31Gfx/WOA1iJTrH57wAU1qYB5B/mCOW3I6I8aZ2	$2a$14$d1Mg1DHk5OmPlu31Gfx/WOA1iJTrH57wAU1qYB5B/mCOW3I6I8aZ2	Login Key	active	2026-04-30 16:37:41.834902-06	\N	2026-04-24 16:23:11.989728	\N	\N	\N
2	1	ak_live_3ead4299	$2a$14$Wby4e4ecJdE4BNt45rVaN.QsCTd9AQ1TcCQ9jCXRBSlpGv0d9E5y2	$2a$14$Wby4e4ecJdE4BNt45rVaN.QsCTd9AQ1TcCQ9jCXRBSlpGv0d9E5y2	hello	active	\N	\N	2026-04-30 15:13:46.007627	\N	\N	\N
\.


--
-- Data for Name: deleted_job_daily_stats; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.deleted_job_daily_stats (user_id, activity_date, emails, jobs, updated_at) FROM stdin;
1	2026-04-25	412	2	2026-04-25 16:26:28.739591-06
\.


--
-- Data for Name: deleted_job_stats; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.deleted_job_stats (user_id, total_verifications, total_jobs, deliverable, risky, undeliverable, catch_all, disposable, invalid_syntax, role_accounts, updated_at) FROM stdin;
1	412	2	262	97	53	0	0	0	0	2026-04-25 16:26:28.733946-06
\.


--
-- Data for Name: domains; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.domains (id, domain, type, excluded, added_by, created_at, updated_at, deleted_at) FROM stdin;
1	test-domain.com	free	f	1	2026-04-30 16:08:22.780624	2026-04-30 16:08:22.780624	\N
2	bulk1.com	disposable	f	1	2026-04-30 16:08:22.800169	2026-04-30 16:08:22.800169	\N
3	bulk2.com	disposable	f	1	2026-04-30 16:08:22.802387	2026-04-30 16:08:22.802387	\N
\.


--
-- Data for Name: email_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_templates (id, template_name, subject, body, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: job_results; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.job_results (id, job_internal_id, email, status, score, reason, is_disposable, is_free, is_role, has_mx, smtp_connect, user_exists, is_catch_all, is_deliverable, is_syntax_valid, is_spam_trap, is_blacklisted, mailbox_full, processing_time, created_at, updated_at, deleted_at, job_id) FROM stdin;
1	1	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	t	f	t	t	f	f	f	3.086	2026-04-24 16:27:45.906432-06	2026-04-24 16:27:45.906432-06	\N	\N
2	2	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	t	f	t	t	f	f	f	2.136	2026-04-24 16:33:16.044638-06	2026-04-24 16:33:16.044638-06	\N	\N
3	3	jueuro@gmail.com	invalid	35	rejected	f	f	f	f	t	f	f	f	t	f	f	f	0.000	2026-04-24 17:18:03.172422-06	2026-04-24 17:18:03.172422-06	\N	\N
4	3	anninmathew@gmail.com	invalid	35	rejected	f	f	f	f	t	f	f	f	t	f	f	f	0.000	2026-04-24 17:18:03.183805-06	2026-04-24 17:18:03.183805-06	\N	\N
5	3	msaul8184@gmail.com	valid	35		f	f	f	f	t	t	f	t	t	f	f	f	0.000	2026-04-24 17:18:03.360235-06	2026-04-24 17:18:03.360235-06	\N	\N
6	3	christopher3324@gmail.com	valid	35		f	f	f	f	t	t	f	t	t	f	f	f	0.000	2026-04-24 17:18:03.639065-06	2026-04-24 17:18:03.639065-06	\N	\N
7	3	troyconfessore@gmail.com	valid	35		f	f	f	f	t	t	f	t	t	f	f	f	0.000	2026-04-24 17:18:03.767745-06	2026-04-24 17:18:03.767745-06	\N	\N
8	3	markfoley301@gmail.com	valid	35		f	f	f	f	t	t	f	t	t	f	f	f	0.000	2026-04-24 17:18:04.404659-06	2026-04-24 17:18:04.404659-06	\N	\N
9	4	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	t	f	t	t	f	f	f	2.186	2026-04-25 10:04:05.623421-06	2026-04-25 10:04:05.623421-06	\N	\N
10	5	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	t	f	t	t	f	f	f	7.607	2026-04-25 10:04:25.137568-06	2026-04-25 10:04:25.137568-06	\N	\N
11	6	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	t	f	t	t	f	f	f	1.831	2026-04-25 10:05:02.583763-06	2026-04-25 10:05:02.583763-06	\N	\N
12	7	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	t	f	t	t	f	f	f	1.880	2026-04-25 10:24:02.477027-06	2026-04-25 10:24:02.477027-06	\N	\N
13	8	nirobsohel272@gmail.com	valid	100		f	t	f	t	t	t	f	t	t	f	f	f	2.036	2026-04-25 12:11:38.539321-06	2026-04-25 12:11:38.539321-06	\N	\N
14	9	jueuro@gmail.com	invalid	35	rejected	f	f	f	t	t	f	f	f	t	f	f	f	0.000	2026-04-25 12:11:59.391555-06	2026-04-25 12:11:59.391555-06	\N	\N
15	9	msaul8184@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:11:59.391555-06	2026-04-25 12:11:59.391555-06	\N	\N
16	9	anninmathew@gmail.com	invalid	35	rejected	f	f	f	t	t	f	f	f	t	f	f	f	0.000	2026-04-25 12:11:59.391555-06	2026-04-25 12:11:59.391555-06	\N	\N
17	9	christopher3324@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:11:59.391555-06	2026-04-25 12:11:59.391555-06	\N	\N
18	9	markfoley301@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:11:59.391555-06	2026-04-25 12:11:59.391555-06	\N	\N
19	9	troyconfessore@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:11:59.391555-06	2026-04-25 12:11:59.391555-06	\N	\N
20	10	jueuro@gmail.com	invalid	35	rejected	f	f	f	t	t	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
21	10	msaul8184@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
22	10	anninmathew@gmail.com	invalid	35	rejected	f	f	f	t	t	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
23	10	christopher3324@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
24	10	markfoley301@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
25	10	troyconfessore@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
26	10	thenaar@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
27	10	misscoya@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
28	10	donaldbryan@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
29	10	drawings22@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
30	10	danstarr640@gmail.com	invalid	35	rejected	f	f	f	t	t	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
31	10	khayadesign@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
32	10	eddiebazinet@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
33	10	nickrust@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
34	10	dpbakkes@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
35	10	arizonajackaz@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
36	10	maquettestudio@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
37	10	miguel050197@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
38	10	sbliemaster@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
39	10	freddy271@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
40	10	tvcleisure@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
41	10	mgretema@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
42	10	momalki@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
43	10	tyme4us@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
44	10	duanem99@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
45	10	cidonca@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
46	10	sophiaduc@gmail.com	invalid	35	rejected	f	f	f	t	t	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
47	10	mdwillie@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
48	10	naomibudelli@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
49	10	gasgas50@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
50	10	gthrowaway100@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
51	10	brackengodfrey@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
52	10	seanbenghiat@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
53	10	tworiver1@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
54	10	julianemeroff@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
55	10	brandonmeisner@gm.com	invalid	35	rejected	f	f	f	t	t	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
56	10	sarahbeebeejaun@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
57	10	cinemamaverick@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
58	10	jripplinger@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
59	10	shazhussain@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
60	10	pbrown18@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
61	10	lloydanglicas@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
62	10	backstrom123@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
63	10	adampoorman@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
64	10	kingjoeroc@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
65	10	deezeedee1@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
66	10	erjonnebiu@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
67	10	romaissanaji@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
68	10	janorsatti@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
69	10	studion34@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
70	10	ferhat9911@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
71	10	alesfojtik@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
72	10	nekobasu69@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
73	10	jeremydelk22@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
74	10	wiserob705@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
75	10	jbeaudoin88@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
76	10	aprimo24@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
77	10	legacypark@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
78	10	cameran2@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
79	10	joshhalber@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
80	10	pvector34@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
81	10	chloevanhoof@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
82	10	bradmiller2@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
83	10	craigvk@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
84	10	solarparking@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
85	10	walidsahyoun@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
86	10	artagnok@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
87	10	jmlhome@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
88	10	shelam3113@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
89	10	oceanjewels@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
90	10	alexvb22@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
91	10	raulcastillorcb@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
92	10	sevencon@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
93	10	georgesapey@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
94	10	tinny71@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
95	10	williamdallis@gmail.com	invalid	35	rejected	f	f	f	t	t	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
96	10	wyzetee@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
97	10	rowric@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
98	10	kylebraniff1@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
99	10	clivehumphreys@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
100	10	torvyn@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
101	10	jcole1313@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
102	10	karenlillard1@gmail.com	invalid	35	rejected	f	f	f	t	t	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
103	10	allenfusco@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
104	10	seriellen@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
105	10	kensford@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
106	10	jamorobb@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
107	10	paulgett@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
108	10	clarajammy@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
109	10	frontlinela@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
110	10	hardeepuppal23@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
111	10	aliciarobins@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
112	10	vaeliana@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
113	10	phyliciaellis@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
114	10	jhonykenned@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
115	10	csbgrateful@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
116	10	expostyle@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
117	10	rickardpetter@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
118	10	mamac1717@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
119	10	ergophobia93@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
120	10	liznewman18@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
121	10	tatianabodiu@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
122	10	danieljmiller1@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
123	10	pawolar@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
124	10	cassiebradford@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
125	10	casavision@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
126	10	jeremiahjohn336@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
127	10	lvargas9715@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
128	10	wthomsan149@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
129	10	idansturgeman@gmail.com	valid	35	worker	f	f	f	t	t	t	f	t	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
130	10	chrisbrantner1@gmail.com	unknown	35	temp_fail	f	f	f	t	t	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
131	10	ulric08@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
132	10	naderis@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
133	10	arizvi116@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
134	10	baciuistvan@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
135	10	alette2025@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
136	10	jtakhar04@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
137	10	bf92088@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
138	10	alexp06@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
139	10	stacyrowlands@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
140	10	mattmancfl@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
141	10	danielajwani@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
142	10	yestermoto@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
143	10	justinwong74@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
144	10	aldricson@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
145	10	laurieclark21@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
146	10	edwardgonzale@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
147	10	larsenslawncare@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
148	10	quig69@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
149	10	coltishsky1@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
150	10	agazdek@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
151	10	jacksoncd1@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
152	10	fstepcic@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
153	10	rpowell727@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
154	10	buildriteconst@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
155	10	cunoalber@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
156	10	wclighting@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
157	10	chazfullenkamp@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
158	10	madisoncline@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
159	10	kingdomreno@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
160	10	jtwchow@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
161	10	suatabay94@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
162	10	konstantinkrnic@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
163	10	cmonaghan031@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
164	10	roydengoode@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
165	10	carolynedenis10@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
166	10	shawnd543@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
167	10	jessicaaura@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
168	10	janpatti@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
169	10	moodhomes@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
170	10	starkinc@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
171	10	hughscott2@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
172	10	ario_baron@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
173	10	clay767@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
174	10	gavin_ston@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
175	10	lyra_russell@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
176	10	n0ah_felix@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
177	10	julian_gabriel1@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
178	10	carapeten@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
179	10	silas__cedric@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
180	10	archer_ivan@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
181	10	astridv_ridy@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
182	10	kips05@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
183	10	cassidytatum@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
184	10	holden_jace@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
185	10	river_lane@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
186	10	david_kimaol@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
187	10	wodiwalk@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
188	10	cooper_bryce@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
189	10	jacksonhewitt0@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
190	10	robingle938@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
191	10	ibrazaid@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
192	10	elijah_thompso@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
193	10	rozirez@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
194	10	mskristy531@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
195	10	ferrethouse152@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
196	10	evertonwhite@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
197	10	brysenodic@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
198	10	tindracerys@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
199	10	lewsess@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
200	10	victor_thor@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
201	10	gulliverben@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
202	10	abdourahman77@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
203	10	joeycumley@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
204	10	kylejohansonopw@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
205	10	simithpaul@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
206	10	colinroberts462@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
207	10	sangnguyen410@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
208	10	elmiraudartseva@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
209	10	blakekeach@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
210	10	noellies@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
211	10	ryanorchard@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
212	10	abid101a@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
213	10	fatimateixeira@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
214	10	katiew_90@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
215	10	ma1zur@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
216	10	dreamergirl2021@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
217	10	theman08@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
218	10	elonnelindo@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
219	10	u_baf575b7507e@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.121161-06	2026-04-25 12:29:23.121161-06	\N	\N
220	10	naanorks@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.1567-06	2026-04-25 12:29:23.1567-06	\N	\N
221	10	nelly2perpignan@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.1567-06	2026-04-25 12:29:23.1567-06	\N	\N
222	10	lolsen2@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.1567-06	2026-04-25 12:29:23.1567-06	\N	\N
223	10	mooth0dd@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.1567-06	2026-04-25 12:29:23.1567-06	\N	\N
224	10	sigelltd@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.1567-06	2026-04-25 12:29:23.1567-06	\N	\N
225	10	regina_mendes@gmail.com	unknown	35	throttled	f	f	f	f	f	f	f	f	t	f	f	f	0.000	2026-04-25 12:29:23.1567-06	2026-04-25 12:29:23.1567-06	\N	\N
226	12	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	t	f	t	t	f	f	f	2.343	2026-04-25 15:53:47.811959-06	2026-04-25 15:53:47.811959-06	\N	\N
644	19	test@example.com	unknown	35	smtp	f	f	f	t	f	f	f	f	t	f	f	f	0.003	2026-04-28 10:12:18.963164-06	2026-04-28 10:12:18.963164-06	\N	\N
645	20	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.707	2026-04-28 10:13:36.996107-06	2026-04-28 10:13:36.996107-06	\N	\N
646	21	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.772	2026-04-28 10:18:41.537789-06	2026-04-28 10:18:41.537789-06	\N	\N
647	22	nirobsohel272@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.651	2026-04-28 10:21:22.458926-06	2026-04-28 10:21:22.458926-06	\N	\N
648	23	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.939	2026-04-30 07:22:19.664395-06	2026-04-30 07:22:19.664395-06	\N	\N
649	24	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.770	2026-04-30 10:08:58.379185-06	2026-04-30 10:08:58.379185-06	\N	\N
650	25	alexey@send.ifaverankings.com	invalid	0	mx	f	f	f	f	f	f	f	f	t	f	f	f	0.198	2026-04-30 10:09:07.338149-06	2026-04-30 10:09:07.338149-06	\N	\N
651	26	starneit105@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.556	2026-04-30 10:09:19.840758-06	2026-04-30 10:09:19.840758-06	\N	\N
652	27	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.655	2026-04-30 10:09:34.309522-06	2026-04-30 10:09:34.309522-06	\N	\N
653	28	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.982	2026-04-30 10:15:34.888906-06	2026-04-30 10:15:34.888906-06	\N	\N
654	29	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.621	2026-04-30 10:18:26.303918-06	2026-04-30 10:18:26.303918-06	\N	\N
687	62	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.769	2026-04-30 14:48:09.670351-06	2026-04-30 14:48:09.670351-06	\N	\N
688	63	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.669	2026-04-30 14:48:29.720219-06	2026-04-30 14:48:29.720219-06	\N	\N
689	64	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	2.290	2026-04-30 14:58:35.822412-06	2026-04-30 14:58:35.822412-06	\N	\N
690	65	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	1.729	2026-04-30 14:58:57.930311-06	2026-04-30 14:58:57.930311-06	\N	\N
691	66	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	2.872	2026-04-30 15:35:46.339298-06	2026-04-30 15:35:46.339298-06	\N	\N
692	67	fr.nirobsohel@gmail.com	valid	100		f	t	f	t	t	f	f	t	t	f	f	f	3.213	2026-04-30 15:35:53.802561-06	2026-04-30 15:35:53.802561-06	\N	\N
\.


--
-- Data for Name: job_tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.job_tasks (id, job_id, start_index, end_index, pushed_count, status, worker_server, created_at, updated_at) FROM stdin;
1	single_69ebee61e1d6dbce	0	0	1	completed		2026-04-24 16:27:45.901962	2026-04-24 16:27:45.901962
2	single_69ebefac34bd8ef7	0	0	1	completed		2026-04-24 16:33:16.044386	2026-04-24 16:33:16.044386
3	job_69ebfa29747940d2cbbfe3d4	0	5	6	completed	standalone-go-worker	2026-04-24 17:18:01.622261	2026-04-24 17:18:04.405222
4	single_69ece5f5139dee03	0	0	1	completed		2026-04-25 10:04:05.609377	2026-04-25 10:04:05.609377
5	single_69ece6091ffe55b2	0	0	1	completed		2026-04-25 10:04:25.136884	2026-04-25 10:04:25.136884
6	single_69ece62e5afd46c3	0	0	1	completed		2026-04-25 10:05:02.58323	2026-04-25 10:05:02.58323
7	single_69eceaa2b82629d1	0	0	1	completed		2026-04-25 10:24:02.476739	2026-04-25 10:24:02.476739
8	single_69ed03da80f4cdc4	0	0	1	completed		2026-04-25 12:11:38.529342	2026-04-25 12:11:38.529342
9	job_69ed03e520c175aeb98ca739	0	5	6	completed		2026-04-25 12:11:49.505191	2026-04-25 12:11:59.397974
10	job_69ed0739235cb98606d34f76	0	205	206	completed		2026-04-25 12:26:01.359765	2026-04-25 12:29:23.162491
12	single_69ed37eb068842ca	0	0	1	completed		2026-04-25 15:53:47.810998	2026-04-25 15:53:47.810998
\.


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.jobs (id, user_id, job_id, email, filename, file_url, status, type, total_emails, processed_count, deliverable, risky, undeliverable, catch_all, invalid_syntax, role_accounts, disposable, verified_count, created_at, updated_at, deleted_at) FROM stdin;
1	1	single_69ebee61e1d6dbce	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-24 16:27:45.901962	2026-04-24 16:27:45.901962	\N
2	1	single_69ebefac34bd8ef7	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-24 16:33:16.044386	2026-04-24 16:33:16.044386	\N
3	1	job_69ebfa29747940d2cbbfe3d4		email test3.txt		completed	bulk	6	6	4	0	2	0	0	0	0	0	2026-04-24 17:18:01.622261	2026-04-24 17:18:04.404122	\N
4	1	single_69ece5f5139dee03	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-25 10:04:05.609377	2026-04-25 10:04:05.609377	\N
5	1	single_69ece6091ffe55b2	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-25 10:04:25.136884	2026-04-25 10:04:25.136884	\N
6	1	single_69ece62e5afd46c3	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-25 10:05:02.58323	2026-04-25 10:05:02.58323	\N
7	1	single_69eceaa2b82629d1	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-25 10:24:02.476739	2026-04-25 10:24:02.476739	\N
8	1	single_69ed03da80f4cdc4	nirobsohel272@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-25 12:11:38.529342	2026-04-25 12:11:38.529342	\N
9	1	job_69ed03e520c175aeb98ca739		email test3.txt		completed	bulk	6	6	4	0	2	0	0	0	0	0	2026-04-25 12:11:49.505191	2026-04-25 12:11:59.397001	\N
10	1	job_69ed0739235cb98606d34f76		New Text Document (3).txt		completed	bulk	206	206	103	96	7	0	0	0	0	0	2026-04-25 12:26:01.359765	2026-04-25 12:29:23.158095	\N
12	1	single_69ed37eb068842ca	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-25 15:53:47.810998	2026-04-25 15:53:47.810998	\N
15	1	single_9dea26efbe	fr.nirobsohel@gmail.com			completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-28 10:05:35.83004	2026-04-28 10:05:35.83004	\N
16	1	single_0df363084e	fr.nirobsohel@gmail.com			completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-28 10:09:24.157467	2026-04-28 10:09:24.157467	\N
17	1	single_a8741e36b7	fr.nirobsohel@gmail.com			completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-28 10:09:40.72436	2026-04-28 10:09:40.72436	\N
18	1	single_dc6b53d66a	test@example.com			completed	single	1	1	0	0	0	0	0	0	0	0	2026-04-28 10:11:24.707417	2026-04-28 10:11:24.707417	\N
19	1	single_e85ca8294a	test@example.com			completed	single	1	1	0	0	0	0	0	0	0	0	2026-04-28 10:12:18.952196	2026-04-28 10:12:18.952196	\N
20	1	single_e37876bfeb	fr.nirobsohel@gmail.com			completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-28 10:13:36.994484	2026-04-28 10:13:36.994484	\N
21	1	single_c521e444ab	fr.nirobsohel@gmail.com			completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-28 10:18:41.528657	2026-04-28 10:18:41.528657	\N
22	1	single_d360aa06c4	nirobsohel272@gmail.com			completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-28 10:21:22.4574	2026-04-28 10:21:22.4574	\N
23	1	single_421ee2668f	fr.nirobsohel@gmail.com			completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 07:22:19.622564	2026-04-30 07:22:19.622564	\N
24	1	single_7e376d235b	fr.nirobsohel@gmail.com			completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 10:08:58.368085	2026-04-30 10:08:58.368085	\N
25	1	single_db01ce6a73	alexey@send.ifaverankings.com			completed	single	1	1	0	0	1	0	0	0	0	0	2026-04-30 10:09:07.336903	2026-04-30 10:09:07.336903	\N
26	1	single_9e6404be99	starneit105@gmail.com			completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 10:09:19.839738	2026-04-30 10:09:19.839738	\N
27	1	single_a9c0979543	fr.nirobsohel@gmail.com			completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 10:09:34.309053	2026-04-30 10:09:34.309053	\N
28	1	single_90bd41b99e	fr.nirobsohel@gmail.com			completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 10:15:34.887878	2026-04-30 10:15:34.887878	\N
29	1	single_44f0179562	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 10:18:26.299712	2026-04-30 10:18:26.299712	\N
62	1	single_40dc994117	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 14:48:09.640653	2026-04-30 14:48:09.640653	\N
63	1	single_33cc58c957	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 14:48:29.713321	2026-04-30 14:48:29.713321	\N
64	1	single_29cc507959	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 14:58:35.819378	2026-04-30 14:58:35.819378	\N
65	1	single_dde5fc0e59	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 14:58:57.921923	2026-04-30 14:58:57.921923	\N
66	1	single_f3e7edb396	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 15:35:46.261893	2026-04-30 15:35:46.261893	\N
67	1	single_a94828abd9	fr.nirobsohel@gmail.com	Single Verification		completed	single	1	1	1	0	0	0	0	0	0	0	2026-04-30 15:35:53.648198	2026-04-30 15:35:53.648198	\N
\.


--
-- Data for Name: packages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.packages (id, name, tagline, credits_amount, price, description, features, status, popular, created_at, updated_at, deleted_at) FROM stdin;
1	First Free		100	0.00			active	f	2026-04-30 16:22:18.999019-06	2026-04-30 16:22:18.999019-06	\N
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schema_migrations (version, dirty) FROM stdin;
1	f
\.


--
-- Data for Name: security_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.security_logs (id, user_id, severity, module, message, created_at) FROM stdin;
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.settings (id, setting_key, setting_value, created_at, updated_at, deleted_at) FROM stdin;
1	worker_api_key_encrypted	t4Jz7pbJg7y2q1EWqQMY7qh/3IEvGFKyZlnLPwM6LIhIb7/rAKFSVhGnFht8iNbf/u1PymuGg2GM:ba96997a2ed65ec4690d830bab183066	2026-04-25 17:14:49.432214	2026-04-25 17:14:49.432214	\N
2	worker_api_key_hash	6a1a17e52c09b2bc39a6862f6d623186dda536c902469a85fa0cddbe5a0f083b	2026-04-25 17:14:49.432214	2026-04-25 17:14:49.432214	\N
3	new_test_key	test_value	2026-04-30 16:11:48.107319	2026-04-30 16:11:48.107319	\N
4	chunk_size	50000	2026-04-30 16:11:48.123451	2026-04-30 16:11:48.123451	\N
\.


--
-- Data for Name: smtp_configs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.smtp_configs (id, host, port, username, password, encryption, daily_limit, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transactions (id, user_id, transaction_id, amount, credits_added, payment_method, type, status, provider, package, description, created_at) FROM stdin;
1	1	single_9b7fc887b26f011f89d4	0.00	-1	manual	single_verify	completed	system		Single email verification: fr.nirobsohel@gmail.com	2026-04-24 16:27:45.901962
2	1	single_3ce92ad1295877715779	0.00	-1	manual	single_verify	completed	system		Single email verification: fr.nirobsohel@gmail.com	2026-04-24 16:33:16.044386
3	1	TXN_69ebfa295b7012247049	0.00	-6	manual	bulk_verify	completed	system		Bulk verification: email test3.txt (6 emails)	2026-04-24 17:18:01.622261
4	1	single_2616b0d35ee7b8a4b8da	0.00	-1	manual	single_verify	completed	system		Single email verification: fr.nirobsohel@gmail.com	2026-04-25 10:04:05.609377
5	1	single_41b99a6d970591d98a37	0.00	-1	manual	single_verify	completed	system		Single email verification: fr.nirobsohel@gmail.com	2026-04-25 10:04:25.136884
6	1	single_f64f061b86d2a9923daf	0.00	-1	manual	single_verify	completed	system		Single email verification: fr.nirobsohel@gmail.com	2026-04-25 10:05:02.58323
7	1	single_1d37c6e08242742dade9	0.00	-1	manual	single_verify	completed	system		Single email verification: fr.nirobsohel@gmail.com	2026-04-25 10:24:02.476739
8	1	single_0d2d3322bcfc9559526c	0.00	-1	manual	single_verify	completed	system		Single email verification: nirobsohel272@gmail.com	2026-04-25 12:11:38.529342
9	1	TXN_69ed03e58de98dd18f3e	0.00	-6	manual	bulk_verify	completed	system		Bulk verification: email test3.txt (6 emails)	2026-04-25 12:11:49.505191
10	1		10.00	1000	manual	purchase	completed	system		Admin added credits	2026-04-25 12:25:33.692877
11	1	TXN_69ed07398c2ec0afa798	0.00	-206	manual	bulk_verify	completed	system		Bulk verification: New Text Document (3).txt (206 emails)	2026-04-25 12:26:01.359765
12	1	TXN_69ed379d29ef13dab434	0.00	-206	manual	bulk_verify	completed	system		Bulk verification: New Text Document (3).txt (206 emails)	2026-04-25 15:52:29.304978
13	1	single_fb3f72c8eeda24920bbd	0.00	-1	manual	single_verify	completed	system		Single email verification: fr.nirobsohel@gmail.com	2026-04-25 15:53:47.810998
14	1	TXN_69ed3ac83be894678279	0.00	-206	manual	bulk_verify	completed	system		Bulk verification: New Text Document (3).txt (206 emails)	2026-04-25 16:06:00.98649
15	1	TXN_69f380d262703721	0.00	-1	manual	usage	completed	system		Single Verify: fr.nirobsohel@gmail.com	2026-04-30 10:18:26.292531
48	1	TXN_69f3c00965a89558	0.00	-1	manual	usage	completed	system		Single Verify: fr.nirobsohel@gmail.com	2026-04-30 14:48:09.548407
49	1	TXN_69f3c01d073e6bbb	0.00	-1	manual	usage	completed	system		Single Verify: fr.nirobsohel@gmail.com	2026-04-30 14:48:29.706539
50	1	TXN_69f3c1ffca904758	123.00	522	manual	purchase	completed	system		Admin added credits	2026-04-30 14:56:31.85388
51	1	TXN_69f3c27b0fbc2306	0.00	-1	manual	usage	completed	system		Single Verify: fr.nirobsohel@gmail.com	2026-04-30 14:58:35.817854
52	1	TXN_69f3c291a1be7bbb	0.00	-1	manual	usage	completed	system		Single Verify: fr.nirobsohel@gmail.com	2026-04-30 14:58:57.914723
53	1	TXN_69f3cb31fa08b6d0	0.00	-1	manual	usage	completed	system		Single Verify: fr.nirobsohel@gmail.com	2026-04-30 15:35:45.879613
54	1	TXN_69f3cb39c7eaaee4	0.00	-1	manual	usage	completed	system		Single Verify: fr.nirobsohel@gmail.com	2026-04-30 15:35:53.489966
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, email, password, role, credits, status, webhook_url, webhook_secret, created_at, deleted_at, updated_at) FROM stdin;
1	Sohel Nirob	admin@example.com	$2a$14$qFD4uTaxP4stxbzvTxFfre3PV/O7S49kkC5U5lYz3n5DbgBTokt2m	admin	963	Active			2026-04-24 16:23:10.910444	\N	\N
\.


--
-- Data for Name: worker_servers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.worker_servers (id, server_name, ip_address, port, auth_token, ip_reputation, rate_limit, daily_limit, worker_count, emails_verified, last_ping, status, enabled, created_at) FROM stdin;
1	DESKTOP-52AO2OK	::1	80		Good	100	50000	10	0	2026-04-30 16:37:36.95788-06	online	t	2026-04-24 16:22:05.162097
\.


--
-- Name: activity_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.activity_logs_id_seq', 9, true);


--
-- Name: api_keys_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.api_keys_id_seq', 2, true);


--
-- Name: deleted_job_stats_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.deleted_job_stats_user_id_seq', 1, false);


--
-- Name: domains_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.domains_id_seq', 4, true);


--
-- Name: email_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.email_templates_id_seq', 1, false);


--
-- Name: job_results_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.job_results_id_seq', 692, true);


--
-- Name: job_tasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.job_tasks_id_seq', 14, true);


--
-- Name: jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.jobs_id_seq', 67, true);


--
-- Name: packages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.packages_id_seq', 2, true);


--
-- Name: security_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.security_logs_id_seq', 1, false);


--
-- Name: settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.settings_id_seq', 4, true);


--
-- Name: smtp_configs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.smtp_configs_id_seq', 1, false);


--
-- Name: transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.transactions_id_seq', 54, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- Name: worker_servers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.worker_servers_id_seq', 1, true);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: deleted_job_daily_stats deleted_job_daily_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deleted_job_daily_stats
    ADD CONSTRAINT deleted_job_daily_stats_pkey PRIMARY KEY (user_id, activity_date);


--
-- Name: deleted_job_stats deleted_job_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deleted_job_stats
    ADD CONSTRAINT deleted_job_stats_pkey PRIMARY KEY (user_id);


--
-- Name: domains domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domains
    ADD CONSTRAINT domains_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: job_results job_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_results
    ADD CONSTRAINT job_results_pkey PRIMARY KEY (id);


--
-- Name: job_tasks job_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_tasks
    ADD CONSTRAINT job_tasks_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: security_logs security_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_logs
    ADD CONSTRAINT security_logs_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: smtp_configs smtp_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smtp_configs
    ADD CONSTRAINT smtp_configs_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: worker_servers worker_servers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_servers
    ADD CONSTRAINT worker_servers_pkey PRIMARY KEY (id);


--
-- Name: idx_activity_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_user_id ON public.activity_logs USING btree (user_id);


--
-- Name: idx_api_keys_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_deleted_at ON public.api_keys USING btree (deleted_at);


--
-- Name: idx_api_keys_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_api_keys_key ON public.api_keys USING btree (key);


--
-- Name: idx_api_keys_key_prefix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_key_prefix ON public.api_keys USING btree (key_prefix);


--
-- Name: idx_api_keys_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_user_id ON public.api_keys USING btree (user_id);


--
-- Name: idx_domains_added_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_domains_added_by ON public.domains USING btree (added_by);


--
-- Name: idx_domains_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_domains_deleted_at ON public.domains USING btree (deleted_at);


--
-- Name: idx_domains_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_domains_domain ON public.domains USING btree (domain);


--
-- Name: idx_email_templates_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_deleted_at ON public.email_templates USING btree (deleted_at);


--
-- Name: idx_email_templates_template_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_email_templates_template_name ON public.email_templates USING btree (template_name);


--
-- Name: idx_job_internal_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_internal_status ON public.job_results USING btree (job_internal_id, status);


--
-- Name: idx_job_results_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_results_deleted_at ON public.job_results USING btree (deleted_at);


--
-- Name: idx_job_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_status ON public.job_results USING btree (job_id, status);


--
-- Name: idx_job_tasks_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tasks_job_id ON public.job_tasks USING btree (job_id);


--
-- Name: idx_jobs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_created_at ON public.jobs USING btree (created_at);


--
-- Name: idx_jobs_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_deleted_at ON public.jobs USING btree (deleted_at);


--
-- Name: idx_jobs_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_jobs_job_id ON public.jobs USING btree (job_id);


--
-- Name: idx_jobs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_user_id ON public.jobs USING btree (user_id);


--
-- Name: idx_packages_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_packages_deleted_at ON public.packages USING btree (deleted_at);


--
-- Name: idx_security_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_logs_user_id ON public.security_logs USING btree (user_id);


--
-- Name: idx_settings_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settings_deleted_at ON public.settings USING btree (deleted_at);


--
-- Name: idx_settings_setting_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_settings_setting_key ON public.settings USING btree (setting_key);


--
-- Name: idx_status_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_status_updated ON public.job_tasks USING btree (status, updated_at);


--
-- Name: idx_transactions_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_transactions_transaction_id ON public.transactions USING btree (transaction_id);


--
-- Name: idx_user_type_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_type_status_created ON public.jobs USING btree (user_id, status, type, created_at);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_worker_servers_server_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_worker_servers_server_name ON public.worker_servers USING btree (server_name);


--
-- Name: api_keys fk_api_keys_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: domains fk_domains_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domains
    ADD CONSTRAINT fk_domains_user FOREIGN KEY (added_by) REFERENCES public.users(id);


--
-- Name: job_results fk_job_results_job; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_results
    ADD CONSTRAINT fk_job_results_job FOREIGN KEY (job_internal_id) REFERENCES public.jobs(id);


--
-- Name: jobs fk_jobs_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT fk_jobs_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: transactions fk_transactions_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict dspqiVILEnrBFfsWpzs8BA7Jwxt8iPlZqtbyyZfCRWAL49KsvX2ZdSVtZcqVreQ

