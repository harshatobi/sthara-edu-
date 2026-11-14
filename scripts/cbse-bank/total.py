import json,sys,re
for f in sys.argv[1:]:
  its=json.load(open(f)); seen={}
  for it in its:
    n=re.match(r'\d+',it['q']).group(0)
    seen.setdefault(n,it['marks'] or 0)
  print(f.split('/')[-1],'total',sum(seen.values()),'questions',len(seen), {n:m for n,m in seen.items()})
