"""接口回归：临时凭证文件和本机替身上游；不读取用户真实配置。"""
import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import request, error
spec=importlib.util.spec_from_file_location('overview',Path(__file__).with_name('overview-server.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
DATA={'schema':1,'plan':{'id':'test','name':'演示'},'before':{'orgs':[{'id':'o','name':'产品一部'}]},'after':{},'changes':{},'flows':{},'facts':[{'id':'count','text':'核对总编：调整前28个，调整后31个，增加3个（+3）'}],'reportFacts':[{'id':'report:count','text':'配置3个编制。'}]}
def output(text='拟整合团队。'):
    return {'paragraphs':[{'orgId':'o','action':'other','conclusion':[{'text':text}],'details':[{'factId':'report:count'}],'evidenceIds':['org:o']}],'reviewNotes':[]}
class Upstream(BaseHTTPRequestHandler):
    response=None; status=200; body=None
    def do_POST(self):
        type(self).body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(type(self).status);self.end_headers();self.wfile.write(json.dumps(type(self).response).encode())
    def log_message(self,*args):pass
class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.root=Path(cls.temp.name);cls.env=cls.root/'settings.env'
        cls.up=ThreadingHTTPServer(('127.0.0.1',0),Upstream);threading.Thread(target=cls.up.serve_forever,daemon=True).start()
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),m.Handler);cls.server.static_root=cls.root;cls.server.env_file=cls.env
        (cls.root/'index.html').write_text('hello');(cls.root/'.hidden').write_text('secret')
        threading.Thread(target=cls.server.serve_forever,daemon=True).start();cls.url=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.up.shutdown();cls.up.server_close();cls.temp.cleanup()
    def setUp(self):
        self.env.write_text(f'OTHER=keep\nOVERVIEW_API_BASE_URL=http://127.0.0.1:{self.up.server_port}\nOVERVIEW_API_KEY=private-test-key\nOVERVIEW_MODEL=test\n')
        Upstream.status=200;Upstream.response={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(output())}}]}
    def api(self,path,payload=None,headers=None,method=None):
        req=request.Request(self.url+path,data=json.dumps(payload).encode() if payload is not None else None,headers={'Content-Type':'application/json',**(headers or {})},method=method)
        try:
            with request.urlopen(req) as r:return r.status,r.read()
        except error.HTTPError as e:return e.code,e.read()
    def payload(self):
        return {'facts':DATA,'factsHash':hashlib.sha256(json.dumps(DATA,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),'requestId':'r'}
    def test_fact_expansion(self):
        status,raw=self.api('/api/organization-overview',self.payload());self.assertEqual(status,200,raw)
        d=json.loads(raw);self.assertEqual(d['paragraphs'][0]['runs'][2]['text'],'配置3个编制。');self.assertEqual(d['requestId'],'r')
        self.assertIn('{\"factId\": \"report:count\"}',Upstream.body['messages'][1]['content']);model_data=json.loads(Upstream.body['messages'][1]['content'].split('请根据下列事实返回约定JSON：\n',1)[1]);self.assertNotIn('facts',model_data);self.assertEqual(model_data['auditFacts'][0]['auditKey'],'count');self.assertEqual(DATA['facts'][0]['id'],'count');self.assertEqual(Upstream.body['response_format'],{'type':'json_object'});self.assertEqual(Upstream.body['stream'],False)
    def test_deepseek_uses_low_reasoning_without_changing_other_models(self):
        class Captured(Exception): pass
        class Capture:
            def open(self, req, **kwargs):
                self.body = json.loads(req.data)
                raise Captured()
        for base, model, expected in [
            ('https://api.deepseek.com', 'deepseek-flash', True),
            ('https://api.deepseek.com/v1', 'deepseek-flash', True),
            ('https://api.deepseek.com', 'deepseek-chat', False),
            ('https://api.example.com/v1', 'deepseek-flash', False),
            ('https://api.example.com/v1', 'compatible-model', False),
        ]:
            with self.subTest(base=base, model=model):
                capture = Capture()
                config = m.load_config(self.env) | {'baseUrl': base, 'model': model}
                with patch.object(m.request, 'build_opener', return_value=capture):
                    with self.assertRaises(Captured): m.call_model(config, DATA)
                if expected:
                    self.assertEqual(capture.body['thinking'], {'type': 'enabled'})
                    self.assertEqual(capture.body['reasoning_effort'], 'low')
                else:
                    self.assertNotIn('thinking', capture.body)
                    self.assertNotIn('reasoning_effort', capture.body)
                self.assertEqual(capture.body['max_tokens'], 16384)
                self.assertFalse(capture.body['stream'])

    def test_raw_audit_fact_cannot_expand_into_body(self):
        value=output();value['paragraphs'][0]['details'][0]['factId']='count'
        with self.assertRaises(m.ServiceError):m.validate_output(value,DATA)
        value=output();value['paragraphs'][0]['evidenceIds']=['count']
        self.assertIn('count',m.validate_output(value,DATA)['paragraphs'][0]['evidenceIds'])
    def test_qualitative_only_with_empty_report_facts(self):
        data={**DATA,'reportFacts':[]};value=output('拟将产品一部更名。');value['paragraphs'][0]['details'].clear()
        self.assertEqual(m.validate_output(value,data)['paragraphs'][0]['runs'][1]['text'],'拟将产品一部更名。')
    def test_missing_report_facts_requires_refresh(self):
        payload=self.payload();payload['facts']={k:v for k,v in DATA.items() if k!='reportFacts'}
        with self.assertRaisesRegex(m.ServiceError,'刷新整个工作台'):m.validate_input(payload)
    def test_three_items_get_program_numbering_and_title_weight(self):
        value=output();value['paragraphs'] += [
            {'orgId':'o','action':'other','conclusion':[{'text':'产品一部下新设AI应用部。'}]},
            {'orgId':'o','action':'other','conclusion':[{'text':'数据部划转到项目部管理下。'}]}]
        result=m.validate_output(value,DATA)
        self.assertEqual([p['runs'][0]['text'] for p in result['paragraphs']],['1. ','2. ','3. '])
        self.assertEqual([p['runs'][0]['bold'] for p in result['paragraphs']],[True,True,True])
        self.assertEqual(result['paragraphs'][0]['runs'][2]['text'],'配置3个编制。')
    def test_item_limit_and_model_numbering(self):
        value=output();value['paragraphs'] *= 8
        self.assertEqual(len(m.validate_output(value,DATA)['paragraphs']),8)
        value['paragraphs'].append(value['paragraphs'][0])
        with self.assertRaises(m.ServiceError):m.validate_output(value,DATA)
        with self.assertRaises(m.ServiceError):m.validate_output(output('1. 拟整合团队。'),DATA)
    def test_business_prompt_matches_approved_text(self):
        self.assertTrue(m.SYSTEM_PROMPT.startswith(m.BUSINESS_PROMPT))
        self.assertIn('高层组织变化优先于底层组织变化',m.BUSINESS_PROMPT)
        self.assertIn('随组织复制带出的岗位不罗列',m.BUSINESS_PROMPT)
        self.assertNotIn('report:split:G04',m.SYSTEM_PROMPT)
    def test_deterministic_bold_overrides_model_flags(self):
        value=output();value['paragraphs'][0]['conclusion'][0]['bold']=False;value['paragraphs'][0]['details'][0]['bold']=True
        runs=m.validate_output(value,DATA)['paragraphs'][0]['runs']
        self.assertEqual([r['bold'] for r in runs],[True,True,False])
    def test_resource_summary_is_last_plain_and_not_numbered(self):
        data={**DATA,'reportFacts':DATA['reportFacts']+[{'id':'report:scope:headcounts','text':'方案总编制增加2个，调整后为30个。'}]}
        result=m.validate_output(output(),data)['paragraphs']
        self.assertEqual(len(result),2);self.assertEqual(result[-1]['runs'],[{'text':'方案总编制增加2个，调整后为30个。','bold':False}])
        self.assertEqual(result[-1]['evidenceIds'],['report:scope:headcounts'])
        value=output();value['paragraphs'][0]['details']=[{'factId':'report:scope:headcounts'}]
        with self.assertRaises(m.ServiceError):m.validate_output(value,data)
    def test_unchanged_total_has_no_summary(self):
        self.assertEqual(len(m.validate_output(output(),DATA)['paragraphs']),1)
    def test_higher_level_then_action_priority(self):
        orgs=[{'id':'top','name':'高层','level':2}]+[{'id':x,'name':x,'level':4} for x in ['c','s','t','r','l']]
        data={**DATA,'before':{'orgs':orgs}}
        items=[{'orgId':oid,'action':action,'conclusion':[{'text':label}]} for oid,action,label in [('l','leader','主管'),('r','rename','更名'),('t','transfer','划转'),('s','stop','停用'),('c','create','新设'),('top','leader','高层主管')]]
        result=m.validate_output({'paragraphs':items},data)['paragraphs']
        self.assertEqual([p['runs'][1]['text'] for p in result],['高层主管','新设','停用','划转','更名','主管'])
        self.assertEqual([p['runs'][0]['text'] for p in result],[str(i)+'. ' for i in range(1,7)])
    def test_transfer_uses_higher_before_after_level(self):
        data={**DATA,'before':{'orgs':[{'id':'o','name':'产品一部','level':3},{'id':'b','name':'其他','level':4}]},'after':{'orgs':[{'id':'o','name':'产品一部','level':5}]}}
        value=output();value['paragraphs'].insert(0,{'orgId':'b','action':'create','conclusion':[{'text':'拟新设其他部门。'}]})
        self.assertEqual(m.validate_output(value,data)['paragraphs'][0]['runs'][1]['text'],'拟整合团队。')
    def test_invalid_anchor_action_and_empty_conclusion_rejected(self):
        for key,val in [('orgId','missing'),('action','invented'),('conclusion',[]),('conclusion',[{'text':' '}])]:
            value=output();value['paragraphs'][0][key]=val
            with self.assertRaises(m.ServiceError):m.validate_output(value,DATA)
        data={**DATA,'before':{'orgs':[{'id':'o','name':'产品一部','inScope':False}]}}
        with self.assertRaises(m.ServiceError):m.validate_output(output(),data)
    def test_conclusion_arrangement_boundary_has_punctuation(self):
        value=output('拟在技术部下新设AI应用部')
        result=m.validate_output(value,DATA)['paragraphs'][0]['runs']
        self.assertEqual(''.join(r['text'] for r in result),'1. 拟在技术部下新设AI应用部，配置3个编制。')
        self.assertEqual(result[2],{'text':'，','bold':False})
        value['paragraphs'][0]['details']=[{'text':'其中，团队安排另行说明。'}]
        result=m.validate_output(value,DATA)['paragraphs'][0]['runs']
        self.assertIn('AI应用部。其中',''.join(r['text'] for r in result))
        value['paragraphs'][0]['details']=[]
        self.assertTrue(''.join(r['text'] for r in m.validate_output(value,DATA)['paragraphs'][0]['runs']).endswith('AI应用部。'))
    def test_full_audit_flow_values_preserved_without_mutating_input(self):
        data={**DATA,'flows':{'persons':[{'factId':'count','count':3,'ids':['person-test']}]}}
        m.call_model(m.load_config(self.env),data)
        view=json.loads(Upstream.body['messages'][1]['content'].split('请根据下列事实返回约定JSON：\n',1)[1])
        self.assertEqual(view['flows']['persons'],[{'auditKey':'count','count':3,'ids':['person-test']}])
        self.assertEqual(view['auditFacts'][0]['text'],DATA['facts'][0]['text'])
        self.assertEqual(data['flows']['persons'][0]['factId'],'count')
    def test_key_redaction_and_config_save(self):
        status,raw=self.api('/api/overview/config');self.assertEqual(status,200);self.assertNotIn(b'private-test-key',raw);self.assertTrue(json.loads(raw)['keyConfigured'])
        status,raw=self.api('/api/overview/config',{'model':'updated','apiKey':''});self.assertEqual(status,200);self.assertIn('OTHER=keep',self.env.read_text());self.assertEqual(m.load_config(self.env)['apiKey'],'private-test-key');self.assertEqual(self.env.stat().st_mode & 0o777,0o600)
    def test_invalid_config_preserves_file(self):
        before=self.env.read_bytes();status,_=self.api('/api/overview/config',{'baseUrl':'http://example.com'});self.assertEqual(status,400);self.assertEqual(before,self.env.read_bytes())
    def test_cross_origin(self):
        self.assertEqual(self.api('/api/overview/config',headers={'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.api('/api/organization-overview',self.payload(),{'Sec-Fetch-Site':'cross-site'})[0],403)
    def test_static_hidden_and_traversal(self):
        for method in ['GET','HEAD']:
            for path in ['/.hidden','/../settings.env','/%2e%2e/settings.env']:
                self.assertEqual(self.api(path,method=method)[0],404,(method,path))
    def test_hash_mismatch(self):
        p=self.payload();p['factsHash']='0'*64;self.assertEqual(self.api('/api/organization-overview',p)[0],400)
    def test_unreferenced_numeric_rejected(self):
        for text in ['增加3人','减少三名员工','增编２０个']:
            with self.assertRaises(m.ServiceError):m.validate_output(output(text),DATA)
    def test_numeric_entity_name_allowed(self):
        self.assertEqual(m.validate_output(output('拟将产品一部整合。'),DATA)['paragraphs'][0]['runs'][1]['text'],'拟将产品一部整合。')
    def test_unknown_reference(self):
        value=output();value['paragraphs'][0]['details'][0]['factId']='missing'
        with self.assertRaises(m.ServiceError):m.validate_output(value,DATA)
    def test_empty_and_invalid_output(self):
        for value in [None,{}, {'paragraphs':[]}, {'paragraphs':[{'orgId':'o','action':'other','conclusion':[{'text':' '}]}]}, {'paragraphs':[{'orgId':'o','action':'other','conclusion':[{'text':'说明'}]},{'orgId':'o','action':'other','conclusion':[{'text':' '}]}]}]:
            with self.assertRaises(m.ServiceError):m.validate_output(value,DATA)
    def test_truncated_and_invalid_upstream(self):
        for response in [[], {'choices':[{'finish_reason':'length','message':{'content':'{}'}}]}, {'choices':[{'finish_reason':'stop','message':None}]}, {'choices':[{'finish_reason':'stop','message':{'content':'invalid'}}]}]:
            Upstream.response=response;status,raw=self.api('/api/organization-overview',self.payload());self.assertEqual(status,502,raw)
    def test_auth_error_redacted(self):
        Upstream.status=401;Upstream.response={'error':'private-test-key'};status,raw=self.api('/api/organization-overview',self.payload());self.assertEqual(status,502);self.assertNotIn(b'private-test-key',raw)
    def test_missing_key(self):
        self.env.write_text('OVERVIEW_API_KEY=\n');status,raw=self.api('/api/organization-overview',self.payload());self.assertEqual(status,503);self.assertEqual(json.loads(raw)['code'],'NOT_CONFIGURED')
    def test_timeout_maps_to_clear_error(self):
        with patch.object(m.request, 'build_opener') as opener:
            opener.return_value.open.side_effect=socket.timeout
            status,raw=self.api('/api/organization-overview',self.payload())
        self.assertEqual(status,504);self.assertEqual(json.loads(raw)['code'],'MODEL_TIMEOUT')
    def test_review_note_numbers_also_validated(self):
        value=output();value['reviewNotes']=['另有三名员工待处理']
        with self.assertRaises(m.ServiceError):m.validate_output(value,DATA)
    def test_request_limits(self):
        self.assertEqual(self.api('/api/organization-overview',{}, {'Content-Length':'600001'})[0],413)
if __name__=='__main__':unittest.main()
