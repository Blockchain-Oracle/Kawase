"""Loopback-only evidence server with byte ranges for reliable video seeking."""
import argparse
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from extract import ROOT

class EvidenceHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path=self.translate_path(self.path)
        from pathlib import Path
        file=Path(path)
        if not file.is_file():return super().send_head()
        size=file.stat().st_size
        range_header=self.headers.get('Range')
        start,end=0,size-1
        if range_header:
            match=re.fullmatch(r'bytes=(\d*)-(\d*)',range_header)
            if not match:
                self.send_error(416);return None
            left,right=match.groups()
            if left:
                start=int(left);end=min(int(right) if right else end,end)
            elif right:
                start=max(0,size-int(right))
            if start>=size or end<start:
                self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.end_headers();return None
        stream=file.open('rb');stream.seek(start)
        self.send_response(206 if range_header else 200)
        self.send_header('Content-Type',self.guess_type(str(file)))
        self.send_header('Accept-Ranges','bytes')
        self.send_header('Content-Length',str(end-start+1))
        if range_header:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.remaining=end-start+1
        return stream

    def copyfile(self,source,outputfile):
        remaining=getattr(self,'remaining',None)
        if remaining is None:return super().copyfile(source,outputfile)
        try:
            while remaining:
                block=source.read(min(64*1024,remaining))
                if not block:break
                outputfile.write(block);remaining-=len(block)
        except (BrokenPipeError,ConnectionResetError):pass
        finally:
            if hasattr(self,'remaining'):del self.remaining

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8118);args=p.parse_args()
    ThreadingHTTPServer(('127.0.0.1',args.port),partial(EvidenceHandler,directory=str(ROOT))).serve_forever()
