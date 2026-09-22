#!/usr/bin/env python3
"""Regenerate src/commands/catalog.js from a sys_db_object export (xlsx or csv).

Works with either export shape:
  - Label, Name, Package, Application            (older list layout)
  - Label, Name, Extends table, Extensible, ...   (newer list layout)

Selection: ITOM/ITAM name prefixes, plus every table descending from Task or
Configuration Item (walked through the Extends table column when present).

Usage: python3 tools/build-catalog.py path/to/sys_db_object.xlsx [more exports...]
"""
import sys, json, re
import pandas as pd

PREFIX = re.compile(r'^(ecc_|discovery_|cmdb_|sa_|cloud_|reconcile_|ci_|em_|sn_agent|itom_|samp_|sam_|spotlight_|alm_|sw_|ast_|cert_|sn_itom|sn_disco|sn_cmdb|ldap_|sys_update|sys_upgrade|sys_properties|sysauto|sys_trigger|syslog|sys_db_object|sys_dictionary|sys_user$|sys_user_has_role|sys_user_role|kb_knowledge$|task$|incident$|problem|change_|sc_req|sc_task|dmn_demand|gsw_task|v_plugin|sys_plugins|sys_scope$|sys_app$)')
DROP = re.compile(r'_m2m_|_run_|_staging$|_log_|^cmdb_ci_.*_ext$|^u_')
KEEP_ANYWAY = {'ecc_agent_capability_m2m', 'discovery_device_history', 'discovery_log', 'ecc_queue', 'em_alert', 'em_event', 'sys_update_set'}
PKGS = ['MID Server','Discovery Core','Discovery - IP Based','Discovery and Service Mapping Patterns','Pattern Designer','Discovery Admin Workspace',
 'Configuration Management (CMDB)','Configuration Management (CMDB Enterprise Edition)','CMDB CI Class Models','CMDB Workspace','CMDB Data Manager','Expanded Model and Asset Classes','Model Management',
 'Cloud API','Cloud Provisioning and Governance','Centralized Connection and Credential','Core Automation','ITOM Licensing','Application Service','Event Management','Event Management Core','Software Asset Management','Software Asset Management Professional']

frames = []
for src in sys.argv[1:]:
    df = pd.read_excel(src) if src.endswith(('.xlsx', '.xls')) else pd.read_csv(src)
    frames.append(df)
df = pd.concat(frames, ignore_index=True).dropna(subset=['Name']).drop_duplicates('Name')
df['Name'] = df['Name'].astype(str)
df = df[df['Name'].str.match(r'^[a-z][a-z0-9_]*$')]
labels = dict(zip(df['Name'], df['Label'].astype(str)))

keep = set(n for n in df['Name'] if PREFIX.search(n))
if 'Package' in df.columns:
    keep |= set(df[df['Package'].astype(str).isin(PKGS)]['Name'])
if 'Extends table' in df.columns:
    # Extends is by label. Walk descendants of Task and Configuration Item.
    by_label = {}
    for n, l in labels.items():
        by_label.setdefault(l, []).append(n)
    ext = dict(zip(df['Name'], df['Extends table'].astype(str)))
    children = {}
    for n, e in ext.items():
        if e and e != 'nan':
            for parent in by_label.get(e, []):
                children.setdefault(parent, []).append(n)
    def walk(root):
        out, stack = set(), [root]
        while stack:
            cur = stack.pop()
            for c in children.get(cur, []):
                if c not in out:
                    out.add(c); stack.append(c)
        return out
    keep |= walk('task') | walk('cmdb_ci')

rows = sorted([n, labels[n] if labels[n] != 'nan' else n] for n in keep if (not DROP.search(n) or n in KEEP_ANYWAY))
js = open('src/commands/catalog.js').read()
head = js.split('const CATALOG = ')[0]
tail = js.split(';\n  root.NJ = root.NJ || {};')[1]
head = re.sub(r'\d[\d,]* ITOM-relevant tables', f'{len(rows)} tables', head)
open('src/commands/catalog.js', 'w').write(head + 'const CATALOG = ' + json.dumps(rows, separators=(',', ':')) + ';\n  root.NJ = root.NJ || {};' + tail)
print(len(rows), 'tables written')
