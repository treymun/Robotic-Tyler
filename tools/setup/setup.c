/*
 * ROBOTIC TYLER Setup: the one Windows download.
 *
 * A native Win32 program (no runtime to install). It installs either or both ways to use
 * ROBOTIC TYLER: the Chrome extension and the desktop app (Steam text chat and Steam voice
 * in one app since v2.15, replacing the Control Center and the Voice Studio). The Chrome
 * extension is packed inside this EXE and unpacked to a permanent folder that you add
 * to Chrome once. The desktop app is downloaded from this version's GitHub release,
 * checked against the SHA-256 recorded when this setup was built, and installed silently.
 * It updates a Control Center in place (same app id); on first start it imports and offers
 * to remove an old Voice Studio.
 *
 * Built by tools/setup/build-setup.mjs, which generates payloads.h (file names, sizes,
 * hashes, registry keys, download address) and the resources (icon, logo, manifest).
 *
 * Command line (all optional):
 *   /components=chrome,desktop  preselect parts (control or voice also mean desktop)  /nodesktop  no desktop shortcuts
 *   /source=<url or folder>    download from a mirror or a folder instead of the release
 *   /auto                      start right away, close when finished (exit code 0 = all installed)
 *   /log=<file>                log here (default: %TEMP%\ROBOTIC TYLER Setup <version>\setup.log)
 * Component files placed next to the setup are used instead of downloading (still verified).
 */
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define WIN32_LEAN_AND_MEAN
#define _WIN32_WINNT 0x0601
#include <windows.h>
#include <windowsx.h>
#include <commctrl.h>
#include <shellapi.h>
#include <winhttp.h>
#include <bcrypt.h>
#include <tlhelp32.h>
#include <shlobj.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <wchar.h>
#include "payloads.h"

#ifndef NT_SUCCESS
#define NT_SUCCESS(s) (((NTSTATUS)(s))>=0)
#endif
#ifndef WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY
#define WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY 4
#endif
#ifndef WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3
#define WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3 0x00002000
#endif
#ifndef WM_DPICHANGED
#define WM_DPICHANGED 0x02E0
#endif

/* ── Palette (v2.19): the app's own Steam theme (browser-extension/ui/tokens.css) ─────────────
   Navy canvas, the panel header's store gradient, #c7d5e0 text, online blue, Steam's install green
   for the main action, 2 px corners, Arial (what the app shows on Windows) and tracked capitals. */
#define C_HEAD_A  RGB(0x2a,0x47,0x5e)   /* panel header: store gradient #2a475e -> #1b2838 */
#define C_BODY    RGB(0x1b,0x28,0x38)   /* --rt-bg */
#define C_FOOT    RGB(0x17,0x1a,0x21)   /* --rt-bar (the settings save bar) */
#define C_EDGE    RGB(0x00,0x00,0x00)   /* --rt-edge */
#define C_CARD    RGB(0x16,0x20,0x2d)   /* --rt-block on the canvas */
#define C_CARD_HOT RGB(0x1e,0x2b,0x3b)  /* --rt-surface-2 */
#define C_LINE    RGB(0x0f,0x16,0x1f)   /* --rt-line on the canvas */
#define C_LINE_HOT RGB(0x3d,0x44,0x50)  /* --rt-line-strong */
#define C_SOFT    RGB(0x2a,0x3f,0x5a)   /* --rt-line-soft */
#define C_INK     RGB(0xc7,0xd5,0xe0)   /* --rt-ink */
#define C_INK2    RGB(0xac,0xb2,0xb8)   /* --rt-ink-2 */
#define C_INK3    RGB(0x8f,0x98,0xa0)   /* --rt-ink-3 */
#define C_WHITE   RGB(0xff,0xff,0xff)
#define C_LINK    RGB(0x66,0xc0,0xf4)   /* --rt-link */
#define C_ACTIVE  RGB(0x1a,0x9f,0xff)   /* --rt-active: a chosen card */
#define C_FRAME   RGB(0x53,0xa4,0xc4)   /* Tyler's avatar frame */
#define C_NAME    RGB(0x6d,0xcf,0xf6)   /* the wordmark in the panel header */
#define C_NAME_SUB RGB(0x7f,0xb6,0xcf)
#define C_BLUE_D  RGB(0x41,0x7a,0x9b)   /* --rt-accent-fill, dark end */
#define C_BLUE_L  RGB(0x67,0xc1,0xf5)   /*                   light end */
#define C_GREEN_T RGB(0x5c,0x7e,0x10)   /* --rt-green */
#define C_GREEN_B RGB(0x4c,0x6b,0x22)
#define C_GREEN_HT RGB(0x6b,0x96,0x1b)  /* --rt-green-hover */
#define C_GREEN_HB RGB(0x55,0x7a,0x14)
#define C_GREEN_LN RGB(0x3e,0x5a,0x10)
#define C_LIME    RGB(0xbe,0xee,0x11)   /* Steam's green tag text */
#define C_SUCCESS RGB(0x90,0xba,0x3c)   /* --rt-success */
#define C_RED     RGB(0xec,0x6b,0x6b)   /* --rt-state-error */
#define C_RED_INK RGB(0xff,0x8a,0x8a)   /* --rt-danger-ink */
#define C_RED_BG  RGB(0x3d,0x26,0x2f)   /* --rt-danger-bg on a card */
#define C_RED_D   RGB(0x8c,0x2a,0x2a)
#define C_RED_L   RGB(0xc9,0x4a,0x4a)
#define C_TRACK   RGB(0x10,0x18,0x22)   /* --rt-input */
#define C_TAG     RGB(0x3d,0x44,0x50)   /* --rt-select (the gallery's tags) */
#define C_BLUE_TAG RGB(0x26,0x40,0x55)  /* --rt-blue-fade on a card */
#define C_BTN_FOOT RGB(0x2a,0x2c,0x33)  /* .secondary on the save bar */
#define C_BTN_CARD RGB(0x29,0x32,0x3e)  /* .secondary on a card */

/* ── Controls ────────────────────────────────────────────────────────────── */
#define NCOMP 2
enum { K_CHROME, K_DESKTOP };
enum { IDC_CARD0=1001, IDC_DESKTOP=1010, IDC_RETRY0=1011, IDC_LAUNCH0=1021 };
#define INRANGE(id,base) ((id)>=(base)&&(id)<(base)+NCOMP)
enum { WM_APP_PROGRESS=WM_APP+1, WM_APP_ROW, WM_APP_DONE };
enum { TIMER_ANIM=1, TIMER_AUTOCLOSE=2 };
typedef enum { S_IDLE, S_QUEUED, S_LOCATE, S_DOWNLOAD, S_VERIFY, S_INSTALL, S_DONE, S_FAILED, S_CANCELLED } State;
enum { P_CHOOSE, P_WORK };

typedef struct {
 const wchar_t *key,*title,*tag,*desc,*file,*guid,*display,*exe; const char *sha; ULONGLONG size;
 /* what's on this PC */
 BOOL installed,machine,running; wchar_t instVersion[32],instDir[MAX_PATH];
 /* this run */
 BOOL selected,inRun; volatile LONG state; volatile LONGLONG got,total; DWORD t0;
 wchar_t detail[160],error[600];
 HWND card,retry,launch;
 BOOL chrome,before; /* the Chrome extension (unpacked, not downloaded); installed when this run started */
} Comp;

static Comp g_comp[NCOMP]={
 {.key=L"chrome",.title=L"Chrome extension",.tag=L"IN GOOGLE CHROME",
  .desc=L"Tyler inside Steam web chat in Chrome: text, voice, soundboard and music. Setup unpacks it to a folder you add to Chrome once (Developer mode, Load unpacked).",
  .file=L"",.guid=L"",.display=L"",.exe=L"",.sha="",.size=CHROME_PACK_SIZE,.chrome=TRUE},
 {.key=L"desktop",.title=L"Desktop app",.tag=L"WINDOWS APP",
  .desc=L"Everything in one app, no Chrome needed: Steam chat, voice right in its Steam window (no VB-CABLE), soundboard, music and screen commentary. Updates itself.",
  .file=DESKTOP_FILE,.guid=DESKTOP_GUID,.display=DESKTOP_DISPLAY,.exe=DESKTOP_EXE,.sha=DESKTOP_SHA256,.size=DESKTOP_SIZE},
};

static HINSTANCE g_inst; static HWND g_wnd,g_ok,g_cancelBtn,g_desktop;
static int g_dpi=96,g_page=P_CHOOSE,g_anim=0,g_exitCode=2;
static HFONT f_title,f_sub,f_h1,f_body,f_body14,f_label,f_bold,f_small,f_btn,f_tag;
static CRITICAL_SECTION g_lock; static volatile LONG g_cancel=0,g_busy=0;
static HANDLE g_log=INVALID_HANDLE_VALUE;
static wchar_t g_setupDir[MAX_PATH],g_tempDir[MAX_PATH],g_source[1024],g_base[1024];
static BOOL g_auto=FALSE,g_noDesktop=FALSE,g_sourceIsFolder=FALSE,g_runDesktop=TRUE;
static wchar_t g_preselect[64],g_chromeDir[MAX_PATH],g_chromeList[MAX_PATH];

#define S(v) MulDiv((v),g_dpi,96)
#define W_LOGICAL 760
#define H_LOGICAL 556
#define HEAD_H 88
#define FOOT_H 72

/* ── Small helpers ───────────────────────────────────────────────────────── */
static void logLine(const wchar_t *fmt,...){
 if(g_log==INVALID_HANDLE_VALUE)return;
 wchar_t line[1400];SYSTEMTIME t;GetLocalTime(&t);
 int n=swprintf(line,40,L"%04d-%02d-%02d %02d:%02d:%02d  ",t.wYear,t.wMonth,t.wDay,t.wHour,t.wMinute,t.wSecond);
 va_list a;va_start(a,fmt);vswprintf(line+n,1300,fmt,a);va_end(a);wcscat(line,L"\r\n");
 char u8[4200];int len=WideCharToMultiByte(CP_UTF8,0,line,-1,u8,sizeof u8,NULL,NULL);DWORD w;
 if(len>1)WriteFile(g_log,u8,len-1,&w,NULL);
}
static int vercmp(const wchar_t *a,const wchar_t *b){
 int x[3]={0},y[3]={0};swscanf(a,L"%d.%d.%d",&x[0],&x[1],&x[2]);swscanf(b,L"%d.%d.%d",&y[0],&y[1],&y[2]);
 for(int i=0;i<3;i++)if(x[i]!=y[i])return x[i]<y[i]?-1:1;return 0;
}
static void mb(wchar_t *out,size_t n,LONGLONG bytes){swprintf(out,n,L"%.1f MB",bytes/1048576.0);}
static BOOL fileExists(const wchar_t *p){DWORD a=GetFileAttributesW(p);return a!=INVALID_FILE_ATTRIBUTES&&!(a&FILE_ATTRIBUTE_DIRECTORY);}
static void setError(Comp *c,const wchar_t *fmt,...){
 EnterCriticalSection(&g_lock);va_list a;va_start(a,fmt);vswprintf(c->error,600,fmt,a);va_end(a);LeaveCriticalSection(&g_lock);
 logLine(L"%ls: %ls",c->key,c->error);
}
static void setDetail(Comp *c,const wchar_t *s){EnterCriticalSection(&g_lock);wcsncpy(c->detail,s,159);c->detail[159]=0;LeaveCriticalSection(&g_lock);}
static void setState(Comp *c,State s){InterlockedExchange(&c->state,s);PostMessageW(g_wnd,WM_APP_ROW,0,0);}

/* ── What's installed ────────────────────────────────────────────────────── */
static BOOL regStr(HKEY root,REGSAM view,const wchar_t *sub,const wchar_t *name,wchar_t *out,DWORD cch){
 HKEY k;if(RegOpenKeyExW(root,sub,0,KEY_READ|view,&k))return FALSE;
 DWORD type,size=cch*sizeof(wchar_t);LONG r=RegQueryValueExW(k,name,NULL,&type,(BYTE*)out,&size);RegCloseKey(k);
 if(r||(type!=REG_SZ&&type!=REG_EXPAND_SZ))return FALSE;out[cch-1]=0;return TRUE;
}
static BOOL findUninstallKey(Comp *c,HKEY root,REGSAM view,wchar_t *keyOut){
 static const wchar_t *U=L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\";
 wchar_t sub[400],name[300];
 swprintf(sub,400,L"%ls%ls",U,c->guid);
 if(regStr(root,view,sub,L"DisplayVersion",name,300)){wcscpy(keyOut,sub);return TRUE;}
 /* Older or renamed builds: match the display name. */
 HKEY k;if(RegOpenKeyExW(root,L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",0,KEY_READ|view,&k))return FALSE;
 BOOL found=FALSE;wchar_t child[260];
 for(DWORD i=0;!found;i++){DWORD n=260;if(RegEnumKeyExW(k,i,child,&n,NULL,NULL,NULL,NULL))break;
  swprintf(sub,400,L"%ls%ls",U,child);
  if(regStr(root,view,sub,L"DisplayName",name,300)){size_t L=wcslen(c->display);
   if(!wcscmp(name,c->display)||(!wcsncmp(name,c->display,L)&&name[L]==L' '&&iswdigit(name[L+1]))){wcscpy(keyOut,sub);found=TRUE;}}}
 RegCloseKey(k);return found;
}
static BOOL isRunning(const wchar_t *exe){
 HANDLE s=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);if(s==INVALID_HANDLE_VALUE)return FALSE;
 PROCESSENTRY32W e={sizeof e};BOOL hit=FALSE;
 for(BOOL ok=Process32FirstW(s,&e);ok&&!hit;ok=Process32NextW(s,&e))if(!_wcsicmp(e.szExeFile,exe))hit=TRUE;
 CloseHandle(s);return hit;
}
/* The unpacked Chrome extension: its folder and the version in its manifest.json. */
static void detectChrome(Comp *c){
 c->installed=c->machine=c->running=FALSE;c->instVersion[0]=0;wcscpy(c->instDir,g_chromeDir);
 wchar_t mf[MAX_PATH];swprintf(mf,MAX_PATH,L"%ls\\manifest.json",g_chromeDir);
 HANDLE f=CreateFileW(mf,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE,NULL,OPEN_EXISTING,0,NULL);
 if(f!=INVALID_HANDLE_VALUE){char buf[8192];DWORD n=0;ReadFile(f,buf,sizeof buf-1,&n,NULL);CloseHandle(f);buf[n]=0;
  char *v=strstr(buf,"\"version\"");if(v&&(v=strchr(v+9,'"'))){v++;char *e=strchr(v,'"');if(e&&e-v<31){*e=0;MultiByteToWideChar(CP_UTF8,0,v,-1,c->instVersion,32);c->installed=TRUE;}}}
 logLine(L"chrome: %ls%ls in %ls",c->installed?L"unpacked ":L"not unpacked",c->instVersion,g_chromeDir);
}
static void detect(Comp *c){
 if(c->chrome){detectChrome(c);return;}
 c->installed=c->machine=FALSE;c->instVersion[0]=c->instDir[0]=0;
 struct {HKEY root;REGSAM view;} where[]={{HKEY_CURRENT_USER,0},{HKEY_LOCAL_MACHINE,KEY_WOW64_64KEY},{HKEY_LOCAL_MACHINE,KEY_WOW64_32KEY}};
 wchar_t key[400],tmp[MAX_PATH];
 for(int i=0;i<3&&!c->installed;i++){
  if(!findUninstallKey(c,where[i].root,where[i].view,key))continue;
  c->installed=TRUE;c->machine=where[i].root==HKEY_LOCAL_MACHINE;
  regStr(where[i].root,where[i].view,key,L"DisplayVersion",c->instVersion,32);
  wchar_t own[300];swprintf(own,300,L"Software\\%ls",c->guid);
  if(!regStr(where[i].root,where[i].view,own,L"InstallLocation",c->instDir,MAX_PATH)&&regStr(where[i].root,where[i].view,key,L"UninstallString",tmp,MAX_PATH)){
   wchar_t *p=tmp;if(*p==L'"')p++;wchar_t *end=wcsstr(p,L".exe");if(end){*end=0;wchar_t *slash=wcsrchr(p,L'\\');if(slash){*slash=0;wcsncpy(c->instDir,p,MAX_PATH-1);}}}
 }
 c->running=isRunning(c->exe);
 logLine(L"%ls: %ls%ls%ls%ls",c->key,c->installed?L"installed ":L"not installed",c->instVersion,c->machine?L" (all users)":L"",c->running?L", running":L"");
}

/* ── SHA-256 (Windows CNG) ───────────────────────────────────────────────── */
typedef struct {BCRYPT_ALG_HANDLE alg;BCRYPT_HASH_HANDLE h;} Sha;
static BOOL shaInit(Sha *s){s->alg=NULL;s->h=NULL;
 if(!NT_SUCCESS(BCryptOpenAlgorithmProvider(&s->alg,BCRYPT_SHA256_ALGORITHM,NULL,0)))return FALSE;
 return NT_SUCCESS(BCryptCreateHash(s->alg,&s->h,NULL,0,NULL,0,0));}
static void shaAdd(Sha *s,const void *p,ULONG n){BCryptHashData(s->h,(PUCHAR)p,n,0);}
static void shaDone(Sha *s,char hex[65]){UCHAR d[32]={0};BCryptFinishHash(s->h,d,32,0);
 for(int i=0;i<32;i++)sprintf(hex+i*2,"%02x",d[i]);hex[64]=0;BCryptDestroyHash(s->h);BCryptCloseAlgorithmProvider(s->alg,0);}

static void progress(Comp *c){
 static DWORD last=0;DWORD now=GetTickCount();
 if(now-last>=80||c->got==c->total){last=now;PostMessageW(g_wnd,WM_APP_PROGRESS,0,0);}
}
/* Hash a file we already have; TRUE when it is exactly the expected build. */
static BOOL verifyFile(Comp *c,const wchar_t *path){
 HANDLE f=CreateFileW(path,GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,FILE_FLAG_SEQUENTIAL_SCAN,NULL);
 if(f==INVALID_HANDLE_VALUE)return FALSE;
 LARGE_INTEGER sz;GetFileSizeEx(f,&sz);if((ULONGLONG)sz.QuadPart!=c->size){CloseHandle(f);logLine(L"%ls: %ls has the wrong size",c->key,path);return FALSE;}
 setState(c,S_VERIFY);c->got=0;c->total=sz.QuadPart;
 Sha s;if(!shaInit(&s)){CloseHandle(f);return FALSE;}
 static BYTE buf[1<<20];DWORD n;
 while(ReadFile(f,buf,sizeof buf,&n,NULL)&&n){shaAdd(&s,buf,n);c->got+=n;progress(c);if(g_cancel)break;}
 CloseHandle(f);char hex[65];shaDone(&s,hex);
 BOOL ok=!g_cancel&&!strcmp(hex,c->sha);
 if(!ok&&!g_cancel)logLine(L"%ls: %ls does not match the expected checksum",c->key,path);
 return ok;
}

/* ── Download (WinHTTP: system proxy, TLS 1.2+, follows GitHub's redirect) ─ */
static const wchar_t *netError(DWORD e){
 switch(e){
  case ERROR_WINHTTP_NAME_NOT_RESOLVED:return L"Couldn't find the download server. Check your internet connection, then Retry.";
  case ERROR_WINHTTP_CANNOT_CONNECT:case ERROR_WINHTTP_CONNECTION_ERROR:return L"Couldn't connect to the download server. Check your internet connection or proxy, then Retry.";
  case ERROR_WINHTTP_TIMEOUT:return L"The download stopped responding. Retry picks it up from the start.";
  case ERROR_WINHTTP_SECURE_FAILURE:return L"A secure connection to the download server couldn't be made (this often means the PC clock is wrong or a filter is intercepting HTTPS).";
  case ERROR_DISK_FULL:case ERROR_HANDLE_DISK_FULL:return L"There isn't enough free disk space for the download. Free some space, then Retry.";
  default:return NULL;
 }
}
static BOOL download(Comp *c,const wchar_t *url,const wchar_t *dest){
 wchar_t host[256],pathq[2048];URL_COMPONENTSW u={sizeof u};
 u.lpszHostName=host;u.dwHostNameLength=256;u.lpszUrlPath=pathq;u.dwUrlPathLength=2048;u.dwSchemeLength=1;
 wchar_t extra[1024];u.lpszExtraInfo=extra;u.dwExtraInfoLength=1024;
 if(!WinHttpCrackUrl(url,0,0,&u)){setError(c,L"The download address is invalid: %ls",url);return FALSE;}
 wcscat(pathq,extra);
 BOOL secure=u.nScheme==INTERNET_SCHEME_HTTPS,ok=FALSE;DWORD err=0;
 HINTERNET ses=WinHttpOpen(L"ROBOTIC-TYLER-Setup/" SETUP_VERSION,WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
 if(!ses)ses=WinHttpOpen(L"ROBOTIC-TYLER-Setup/" SETUP_VERSION,WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
 HINTERNET con=NULL,req=NULL;HANDLE out=INVALID_HANDLE_VALUE;Sha s={0};BOOL hashing=FALSE;
 if(!ses){err=GetLastError();goto done;}
 DWORD proto=WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2|WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3;
 if(!WinHttpSetOption(ses,WINHTTP_OPTION_SECURE_PROTOCOLS,&proto,sizeof proto)){proto=WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2;WinHttpSetOption(ses,WINHTTP_OPTION_SECURE_PROTOCOLS,&proto,sizeof proto);}
 WinHttpSetTimeouts(ses,30000,30000,30000,60000);
 if(!(con=WinHttpConnect(ses,host,u.nPort,0))){err=GetLastError();goto done;}
 if(!(req=WinHttpOpenRequest(con,L"GET",pathq,NULL,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,secure?WINHTTP_FLAG_SECURE:0))){err=GetLastError();goto done;}
 if(!WinHttpSendRequest(req,WINHTTP_NO_ADDITIONAL_HEADERS,0,WINHTTP_NO_REQUEST_DATA,0,0,0)||!WinHttpReceiveResponse(req,NULL)){err=GetLastError();goto done;}
 DWORD code=0,len=sizeof code;
 WinHttpQueryHeaders(req,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,WINHTTP_HEADER_NAME_BY_INDEX,&code,&len,WINHTTP_NO_HEADER_INDEX);
 if(code!=200){
  if(code==404)setError(c,L"%ls isn't on the release page (HTTP 404). If version %ls was published a moment ago, wait a minute and Retry; otherwise get the newest setup from the release page.",c->file,SETUP_VERSION);
  else setError(c,L"The download server answered HTTP %lu for %ls. Retry in a moment.",code,c->file);
  goto done;
 }
 out=CreateFileW(dest,GENERIC_WRITE,0,NULL,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);
 if(out==INVALID_HANDLE_VALUE){err=GetLastError();setError(c,L"Couldn't save the download to %ls (error %lu).",dest,err);err=0;goto done;}
 if(!shaInit(&s)){setError(c,L"Windows couldn't start the checksum check.");goto done;}
 hashing=TRUE;c->got=0;c->total=c->size;c->t0=GetTickCount();setState(c,S_DOWNLOAD);
 static BYTE buf[1<<16];
 for(;;){
  if(g_cancel){setError(c,L"Cancelled.");goto done;}
  DWORD n=0;if(!WinHttpReadData(req,buf,sizeof buf,&n)){err=GetLastError();goto done;}
  if(!n)break;
  DWORD w;if(!WriteFile(out,buf,n,&w,NULL)||w!=n){err=GetLastError();goto done;}
  shaAdd(&s,buf,n);c->got+=n;
  if((ULONGLONG)c->got>c->size){setError(c,L"The download is bigger than this version's %ls. Retry downloads it again.",c->title);goto done;}
  progress(c);
 }
 ok=TRUE;
done:
 if(hashing){char hex[65];shaDone(&s,hex);
  if(ok&&((ULONGLONG)c->got!=c->size||strcmp(hex,c->sha))){ok=FALSE;
   setError(c,L"The downloaded file didn't match this version's checksum, so it wasn't run (the download was cut short or changed on the way). Retry downloads it again.");}
  if(ok){wchar_t whex[65];MultiByteToWideChar(CP_ACP,0,hex,-1,whex,65);logLine(L"%ls: downloaded %lld bytes, sha256 %ls",c->key,(long long)c->got,whex);}}
 if(!ok&&err){const wchar_t *m=netError(err);if(m)setError(c,L"%ls (error %lu)",m,err);else setError(c,L"The download failed (Windows error %lu). Check your connection, then Retry.",err);}
 if(out!=INVALID_HANDLE_VALUE)CloseHandle(out);
 if(!ok)DeleteFileW(dest);
 if(req)WinHttpCloseHandle(req);if(con)WinHttpCloseHandle(con);if(ses)WinHttpCloseHandle(ses);
 return ok;
}

/* ── One component: find or download its installer, then install it ─────── */
static BOOL acquire(Comp *c,wchar_t *path){
 setState(c,S_LOCATE);
 /* 1. Next to the setup, or in the /source folder (offline installs, mirrors). */
 const wchar_t *dirs[2]={g_sourceIsFolder?g_source:NULL,g_setupDir};
 for(int i=0;i<2;i++){if(!dirs[i])continue;swprintf(path,MAX_PATH,L"%ls\\%ls",dirs[i],c->file);
  if(fileExists(path)){if(verifyFile(c,path)){logLine(L"%ls: using %ls",c->key,path);return TRUE;}if(g_cancel)return FALSE;}}
 /* 2. Left over from an earlier attempt. */
 swprintf(path,MAX_PATH,L"%ls\\%ls",g_tempDir,c->file);
 if(fileExists(path)){if(verifyFile(c,path)){logLine(L"%ls: using the earlier download",c->key);return TRUE;}DeleteFileW(path);if(g_cancel)return FALSE;}
 /* 3. Download it. */
 if(!g_base[0]){setError(c,L"This copy of Setup has no download address. Put %ls next to Setup and Retry, or get Setup from the ROBOTIC TYLER release page.",c->file);return FALSE;}
 wchar_t url[2048],part[MAX_PATH];swprintf(url,2048,L"%ls%ls",g_base,c->file);swprintf(part,MAX_PATH,L"%ls.part",path);
 logLine(L"%ls: downloading %ls",c->key,url);
 if(!download(c,url,part))return FALSE;
 DeleteFileW(path);if(!MoveFileW(part,path)){setError(c,L"Couldn't move the download into place (error %lu).",GetLastError());return FALSE;}
 return TRUE;
}
static BOOL install(Comp *c,const wchar_t *path){
 setState(c,S_INSTALL);
 wchar_t cmd[2*MAX_PATH];
 swprintf(cmd,2*MAX_PATH,L"\"%ls\" /S %ls%ls",path,c->machine?L"/allusers":L"/currentuser",g_runDesktop?L"":L" --no-desktop-shortcut");
 logLine(L"%ls: running %ls",c->key,cmd);
 STARTUPINFOW si={sizeof si};PROCESS_INFORMATION pi;
 if(!CreateProcessW(path,cmd,NULL,NULL,FALSE,0,NULL,g_tempDir,&si,&pi)){
  DWORD e=GetLastError();
  if(e==ERROR_CANCELLED)setError(c,L"Windows asked for permission to install for all users and it wasn't given. Retry and choose Yes.");
  else setError(c,L"Windows couldn't start the %ls installer (error %lu). Antivirus software sometimes blocks new installers; check its quarantine, then Retry.",c->title,e);
  return FALSE;
 }
 DWORD w=WaitForSingleObject(pi.hProcess,20*60*1000),code=1;GetExitCodeProcess(pi.hProcess,&code);
 CloseHandle(pi.hThread);CloseHandle(pi.hProcess);
 if(w!=WAIT_OBJECT_0){setError(c,L"The %ls installer took more than 20 minutes and was left running. Restart Windows, then run Setup again.",c->title);return FALSE;}
 logLine(L"%ls: installer exit code %lu",c->key,code);
 if(code){setError(c,L"The %ls installer stopped with code %lu. If %ls was open and couldn't be closed, close it and Retry. Details are in setup.log in %ls.",c->title,code,c->title,g_tempDir);return FALSE;}
 detect(c);
 if(!c->installed||vercmp(c->instVersion,SETUP_VERSION)){setError(c,L"The installer finished, but Windows lists %ls as %ls. Retry, or restart Windows and run Setup again.",c->title,c->installed?c->instVersion:L"not installed");return FALSE;}
 DeleteFileW(path[0]&&!wcsncmp(path,g_tempDir,wcslen(g_tempDir))?path:L"");
 return TRUE;
}
/* The Chrome extension is packed into this EXE as resource 200: "RTPK1\0\0\0", a u32 file
   count, then per file a u16 path length, the UTF-8 path ('/' separators), a u32 size and
   the bytes. It is unpacked over the same folder every time, so Chrome keeps the same
   extension (and its settings); files an older version had but this one doesn't are removed. */
static char *readSmall(const wchar_t *path){
 HANDLE f=CreateFileW(path,GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,0,NULL);if(f==INVALID_HANDLE_VALUE)return NULL;
 DWORD n=GetFileSize(f,NULL);if(n>4<<20){CloseHandle(f);return NULL;}char *b=malloc(n+3);DWORD got=0;
 if(!b||!ReadFile(f,b+1,n,&got,NULL)){CloseHandle(f);free(b);return NULL;}CloseHandle(f);b[0]='\n';b[got+1]='\n';b[got+2]=0;return b;
}
static BOOL unpackChrome(Comp *c){
 setState(c,S_INSTALL);
 HRSRC r=FindResourceW(g_inst,MAKEINTRESOURCEW(200),(LPCWSTR)RT_RCDATA);
 const BYTE *p=r?LockResource(LoadResource(g_inst,r)):NULL,*end;DWORD n=r?SizeofResource(g_inst,r):0;
 if(!p||n<12||memcmp(p,"RTPK1\0\0\0",8)){setError(c,L"This copy of Setup is missing the Chrome extension files. Download Setup again.");return FALSE;}
 end=p+n;DWORD count;memcpy(&count,p+8,4);const BYTE *q=p+12;c->got=0;c->total=n;c->t0=GetTickCount();
 int made=SHCreateDirectoryExW(NULL,g_chromeDir,NULL);
 if(made!=ERROR_SUCCESS&&made!=ERROR_ALREADY_EXISTS&&made!=ERROR_FILE_EXISTS){setError(c,L"Couldn't create %ls (error %d).",g_chromeDir,made);return FALSE;}
 char *old=readSmall(g_chromeList);size_t cap=(size_t)count*160+8,len=1;char *list=malloc(cap);if(!list){free(old);return FALSE;}list[0]='\n';list[1]=0;
 BOOL ok=TRUE;
 for(DWORD i=0;i<count&&ok;i++){
  WORD pl;DWORD sz;char rel[400];
  if(q+2>end){ok=FALSE;break;}memcpy(&pl,q,2);q+=2;
  if(pl==0||pl>=sizeof rel||q+pl+4>end){ok=FALSE;break;}memcpy(rel,q,pl);rel[pl]=0;q+=pl;memcpy(&sz,q,4);q+=4;
  if(q+sz>end||strstr(rel,"..")||rel[0]=='/'||strchr(rel,':')||strchr(rel,'\\')){ok=FALSE;break;}
  wchar_t wrel[400],full[2*MAX_PATH];MultiByteToWideChar(CP_UTF8,0,rel,-1,wrel,400);for(wchar_t *x=wrel;*x;x++)if(*x==L'/')*x=L'\\';
  swprintf(full,2*MAX_PATH,L"%ls\\%ls",g_chromeDir,wrel);
  wchar_t dir[2*MAX_PATH];wcscpy(dir,full);*wcsrchr(dir,L'\\')=0;SHCreateDirectoryExW(NULL,dir,NULL);
  HANDLE f=CreateFileW(full,GENERIC_WRITE,0,NULL,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);DWORD w=0;
  if(f==INVALID_HANDLE_VALUE||!WriteFile(f,q,sz,&w,NULL)||w!=sz){DWORD e=GetLastError();if(f!=INVALID_HANDLE_VALUE)CloseHandle(f);
   const wchar_t *m=netError(e);setError(c,L"Couldn't write %ls (%ls).",full,m?m:L"Windows refused the write");free(old);free(list);return FALSE;}
  CloseHandle(f);q+=sz;
  if(len+pl+2<cap){memcpy(list+len,rel,pl);len+=pl;list[len++]='\n';list[len]=0;}
  c->got=q-p;progress(c);
 }
 if(!ok){setError(c,L"The Chrome extension files inside this Setup are damaged. Download Setup again.");free(old);free(list);return FALSE;}
 /* Remove files from the previous version that this one no longer has. */
 int removed=0;
 if(old){for(char *line=old+1,*nl;(nl=strchr(line,'\n'));line=nl+1){*nl=0;if(!*line)continue;
   char key[420];snprintf(key,sizeof key,"\n%s\n",line);if(strstr(list,key))continue;
   if(strstr(line,"..")||strchr(line,':'))continue;
   wchar_t w[400],full[2*MAX_PATH];MultiByteToWideChar(CP_UTF8,0,line,-1,w,400);for(wchar_t *x=w;*x;x++)if(*x==L'/')*x=L'\\';
   swprintf(full,2*MAX_PATH,L"%ls\\%ls",g_chromeDir,w);if(DeleteFileW(full))removed++;}}
 HANDLE lf=CreateFileW(g_chromeList,GENERIC_WRITE,0,NULL,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);
 if(lf!=INVALID_HANDLE_VALUE){DWORD w;WriteFile(lf,list+1,(DWORD)(len-1),&w,NULL);CloseHandle(lf);}
 free(old);free(list);
 logLine(L"chrome: unpacked %lu files to %ls (%d old files removed)",count,g_chromeDir,removed);
 detect(c);
 if(vercmp(c->instVersion,SETUP_VERSION)){setError(c,L"The extension was unpacked, but its folder reports version %ls.",c->instVersion[0]?c->instVersion:L"(none)");return FALSE;}
 return TRUE;
}
static DWORD WINAPI worker(LPVOID arg){
 (void)arg;
 for(int i=0;i<NCOMP;i++){Comp *c=&g_comp[i];if(!c->inRun||c->state!=S_QUEUED)continue;
  if(g_cancel){setState(c,S_CANCELLED);continue;}
  if(c->chrome){setState(c,unpackChrome(c)?S_DONE:S_FAILED);continue;}
  wchar_t path[MAX_PATH];
  if(!acquire(c,path)){setState(c,g_cancel?S_CANCELLED:S_FAILED);continue;}
  if(g_cancel){setState(c,S_CANCELLED);continue;}
  setState(c,install(c,path)?S_DONE:S_FAILED);
 }
 InterlockedExchange(&g_busy,0);PostMessageW(g_wnd,WM_APP_DONE,0,0);return 0;
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */
static void fill(HDC dc,RECT r,COLORREF c){HBRUSH b=CreateSolidBrush(c);FillRect(dc,&r,b);DeleteObject(b);}
static RECT rc(int x,int y,int w,int h){RECT r={S(x),S(y),S(x)+S(w),S(y)+S(h)};return r;}
static void grad(HDC dc,RECT r,COLORREF a,COLORREF b,BOOL vertical){
 TRIVERTEX v[2]={{r.left,r.top,GetRValue(a)<<8,GetGValue(a)<<8,GetBValue(a)<<8,0xff00},{r.right,r.bottom,GetRValue(b)<<8,GetGValue(b)<<8,GetBValue(b)<<8,0xff00}};
 GRADIENT_RECT g={0,1};GradientFill(dc,v,2,&g,1,vertical?GRADIENT_FILL_RECT_V:GRADIENT_FILL_RECT_H);
}
static void frame(HDC dc,RECT r,COLORREF c,int t){
 RECT a={r.left,r.top,r.right,r.top+t},b={r.left,r.bottom-t,r.right,r.bottom},l={r.left,r.top,r.left+t,r.bottom},q={r.right-t,r.top,r.right,r.bottom};
 fill(dc,a,c);fill(dc,b,c);fill(dc,l,c);fill(dc,q,c);
}
static int measure(HDC dc,HFONT f,const wchar_t *s){RECT r={0,0,4000,400};HGDIOBJ o=SelectObject(dc,f);DrawTextW(dc,s,-1,&r,DT_SINGLELINE|DT_CALCRECT|DT_NOPREFIX);SelectObject(dc,o);return r.right;}
static int text(HDC dc,HFONT f,COLORREF c,RECT r,const wchar_t *s,UINT fmt){
 HGDIOBJ o=SelectObject(dc,f);SetTextColor(dc,c);SetBkMode(dc,TRANSPARENT);int h=DrawTextW(dc,s,-1,&r,fmt|DT_NOPREFIX);SelectObject(dc,o);return h;
}
static void tick(HDC dc,int x,int y,int size,COLORREF c){ /* a drawn check mark, not a glyph */
 HPEN p=CreatePen(PS_SOLID,max(2,size/7),c);HGDIOBJ o=SelectObject(dc,p);
 POINT pt[3]={{x+size*2/10,y+size*52/100},{x+size*42/100,y+size*74/100},{x+size*82/100,y+size*28/100}};Polyline(dc,pt,3);
 SelectObject(dc,o);DeleteObject(p);
}
static void cross(HDC dc,int x,int y,int size,COLORREF c){
 HPEN p=CreatePen(PS_SOLID,max(2,size/7),c);HGDIOBJ o=SelectObject(dc,p);
 MoveToEx(dc,x+size/4,y+size/4,NULL);LineTo(dc,x+size*3/4,y+size*3/4);MoveToEx(dc,x+size*3/4,y+size/4,NULL);LineTo(dc,x+size/4,y+size*3/4);
 SelectObject(dc,o);DeleteObject(p);
}
/* Steam's focus outline (--rt-focus), dotted so it reads as a keyboard ring. */
static void focusRing(HDC dc,RECT r){InflateRect(&r,-S(3),-S(3));HPEN p=CreatePen(PS_DOT,1,C_LINK);HGDIOBJ op=SelectObject(dc,p),ob=SelectObject(dc,GetStockObject(NULL_BRUSH));Rectangle(dc,r.left,r.top,r.right,r.bottom);SelectObject(dc,op);SelectObject(dc,ob);DeleteObject(p);}
/* Steam is nearly square (2-3 px corners): a 1 px notch at each corner reads as that radius. */
static void box(HDC dc,RECT r,COLORREF fillc,COLORREF border,int bw){
 if(bw>0){fill(dc,r,border);InflateRect(&r,-bw,-bw);}fill(dc,r,fillc);
}
static void notch(HDC dc,RECT r,COLORREF bg){int n=S(1);RECT c[4]={{r.left,r.top,r.left+n,r.top+n},{r.right-n,r.top,r.right,r.top+n},{r.left,r.bottom-n,r.left+n,r.bottom},{r.right-n,r.bottom-n,r.right,r.bottom}};for(int i=0;i<4;i++)fill(dc,c[i],bg);}
/* A diagonal fill like CSS linear-gradient(-60deg, dark, light): light at the top left. */
static void diag(HDC dc,RECT r,COLORREF dark,COLORREF light){
 COLORREF mid=RGB((GetRValue(dark)+GetRValue(light))/2,(GetGValue(dark)+GetGValue(light))/2,(GetBValue(dark)+GetBValue(light))/2);
 #define TV(x,y,c) {x,y,GetRValue(c)<<8,GetGValue(c)<<8,GetBValue(c)<<8,0xff00}
 TRIVERTEX v[4]={TV(r.left,r.top,light),TV(r.right,r.top,mid),TV(r.right,r.bottom,dark),TV(r.left,r.bottom,mid)};
 #undef TV
 GRADIENT_TRIANGLE t[2]={{0,1,2},{0,2,3}};GradientFill(dc,v,4,t,2,GRADIENT_FILL_TRIANGLE);
}
/* Translucent drawing through a 1-pixel premultiplied bitmap and AlphaBlend. */
static DWORD pm(COLORREF c,int a){return ((DWORD)a<<24)|((DWORD)(GetRValue(c)*a/255)<<16)|((DWORD)(GetGValue(c)*a/255)<<8)|(DWORD)(GetBValue(c)*a/255);}
static void alphaFill(HDC dc,RECT r,COLORREF c,int a){int w=r.right-r.left,h=r.bottom-r.top;if(w<=0||h<=0)return;DWORD one=pm(c,a);
 BITMAPINFO bi={{sizeof(BITMAPINFOHEADER),1,-1,1,32,BI_RGB}};void *bits;HBITMAP bmp=CreateDIBSection(dc,&bi,DIB_RGB_COLORS,&bits,NULL,0);if(!bmp)return;
 *(DWORD*)bits=one;HDC m=CreateCompatibleDC(dc);HGDIOBJ o=SelectObject(m,bmp);BLENDFUNCTION bf={AC_SRC_OVER,0,255,AC_SRC_ALPHA};AlphaBlend(dc,r.left,r.top,w,h,m,0,0,1,1,bf);SelectObject(m,o);DeleteDC(m);DeleteObject(bmp);}
/* Tracked capitals (Steam's letter-spaced labels): extra space per letter, in hundredths of an em. */
static int track(int px,int em100){return MulDiv(px*em100,g_dpi,9600);}
static int textT(HDC dc,HFONT f,COLORREF c,RECT r,const wchar_t *s,UINT fmt,int extra){int old=SetTextCharacterExtra(dc,extra);int h=text(dc,f,c,r,s,fmt);SetTextCharacterExtra(dc,old);return h;}
static int measureT(HDC dc,HFONT f,const wchar_t *s,int extra){int old=SetTextCharacterExtra(dc,extra);int w=measure(dc,f,s);SetTextCharacterExtra(dc,old);return w;}
/* Artwork resources from build-setup.mjs (the PNGs in art/): 8-byte header (width, height), premultiplied
   BGRA, at 100/150/200 % (ids base, base+1, base+2). Kept as bitmaps after the first use. */
static HBITMAP g_art[64];static int g_artW[64],g_artH[64];
static void drawArt(HDC dc,int base,int x,int y,int w,int h){
 int pct=MulDiv(100,g_dpi,96),id=base+(pct<=100?0:pct<=150?1:2),slot=(id-300)&63;
 if(!g_art[slot]){
  HRSRC r=FindResourceW(g_inst,MAKEINTRESOURCEW(id),(LPCWSTR)RT_RCDATA);if(!r)return;const BYTE *res=LockResource(LoadResource(g_inst,r));if(!res)return;
  int iw,ih;memcpy(&iw,res,4);memcpy(&ih,res+4,4);if(iw<=0||ih<=0||iw>4000||ih>4000)return;
  BITMAPINFO bi={{sizeof(BITMAPINFOHEADER),iw,-ih,1,32,BI_RGB}};void *bits;HBITMAP bmp=CreateDIBSection(NULL,&bi,DIB_RGB_COLORS,&bits,NULL,0);if(!bmp)return;
  memcpy(bits,res+8,(size_t)iw*ih*4);g_art[slot]=bmp;g_artW[slot]=iw;g_artH[slot]=ih;
 }
 HDC m=CreateCompatibleDC(dc);HGDIOBJ o=SelectObject(m,g_art[slot]);BLENDFUNCTION bf={AC_SRC_OVER,0,255,AC_SRC_ALPHA};
 AlphaBlend(dc,x,y,w,h,m,0,0,g_artW[slot],g_artH[slot],bf);SelectObject(m,o);DeleteDC(m);
}
/* A small tag like the theme gallery's (10 px bold tracked capitals on a 2 px chip). Returns its right edge. */
static int tag(HDC dc,int x,int y,const wchar_t *s,COLORREF ink,COLORREF bg){
 int ex=track(10,4),w=measureT(dc,f_tag,s,ex)+S(12);RECT r={x,y,x+w,y+S(16)};fill(dc,r,bg);
 RECT t=r;t.left+=S(6);textT(dc,f_tag,ink,t,s,DT_SINGLELINE|DT_VCENTER,ex);return r.right;
}
/* Steam's tick box: an inset dark well, or the blue fill with a white tick. */
static void tickBox(HDC dc,RECT b,BOOL on,BOOL hot,BOOL dis,COLORREF bg){
 if(on){fill(dc,b,dis?C_SOFT:C_BLUE_D);RECT in=b;InflateRect(&in,-1,-1);if(dis)fill(dc,in,C_SOFT);else diag(dc,in,C_BLUE_D,C_BLUE_L);tick(dc,b.left,b.top,b.right-b.left,dis?C_INK3:C_WHITE);}
 else{fill(dc,b,hot&&!dis?C_LINK:C_EDGE);RECT in=b;InflateRect(&in,-1,-1);fill(dc,in,C_TRACK);RECT sh={in.left,in.top,in.right,in.top+S(2)};alphaFill(dc,sh,C_EDGE,90);}
 notch(dc,b,bg);
}

/* The logo is stored premultiplied BGRA at a few sizes (resource id = size in px). */
static void drawLogo(HDC dc,int x,int y,int size){
 static const int sizes[]={64,80,96,128};int pick=128;for(int i=0;i<4;i++)if(sizes[i]>=size){pick=sizes[i];break;}
 HRSRC r=FindResourceW(g_inst,MAKEINTRESOURCEW(pick),(LPCWSTR)RT_RCDATA);if(!r)return;
 const BYTE *px=LockResource(LoadResource(g_inst,r));if(!px)return;
 BITMAPINFO bi={{sizeof(BITMAPINFOHEADER),pick,-pick,1,32,BI_RGB}};void *bits;
 HBITMAP bmp=CreateDIBSection(dc,&bi,DIB_RGB_COLORS,&bits,NULL,0);if(!bmp)return;memcpy(bits,px,pick*pick*4);
 HDC m=CreateCompatibleDC(dc);HGDIOBJ o=SelectObject(m,bmp);
 int oldMode=SetStretchBltMode(dc,HALFTONE);BLENDFUNCTION bf={AC_SRC_OVER,0,255,AC_SRC_ALPHA};AlphaBlend(dc,x,y,size,size,m,0,0,pick,pick,bf);SetStretchBltMode(dc,oldMode);
 SelectObject(m,o);DeleteDC(m);DeleteObject(bmp);
}

static int compIndex(int id){return INRANGE(id,IDC_LAUNCH0)?id-IDC_LAUNCH0:INRANGE(id,IDC_RETRY0)?id-IDC_RETRY0:id-IDC_CARD0;}
static void cardStatus(Comp *c,wchar_t *out,size_t n,COLORREF *color){
 wchar_t size[32];mb(size,32,(LONGLONG)c->size);*color=C_INK3;
 if(c->chrome){
  if(!c->installed)swprintf(out,n,L"Not unpacked yet  \x00b7  %ls, already inside this Setup (no download)",size);
  else if(vercmp(c->instVersion,SETUP_VERSION)<0){swprintf(out,n,L"Version %ls in your folder  \x2192  updates to %ls  \x00b7  then press Reload on Tyler in Chrome",c->instVersion,SETUP_VERSION);*color=C_LINK;}
  else if(!vercmp(c->instVersion,SETUP_VERSION)){swprintf(out,n,L"Unpacked and up to date (%ls). Tick to repair the folder.",c->instVersion);*color=C_SUCCESS;}
  else swprintf(out,n,L"Version %ls is in the folder, which is newer than this setup.",c->instVersion);
  return;
 }
 if(!c->installed)swprintf(out,n,L"Not installed  \x00b7  %ls download",size);
 else if(vercmp(c->instVersion,SETUP_VERSION)<0){swprintf(out,n,L"Installed: version %ls  \x2192  updates to %ls  \x00b7  settings and keys are kept",c->instVersion,SETUP_VERSION);*color=C_LINK;}
 else if(!vercmp(c->instVersion,SETUP_VERSION)){swprintf(out,n,L"Installed and up to date (%ls). Tick to repair or reinstall it.",c->instVersion);*color=C_SUCCESS;}
 else swprintf(out,n,L"Version %ls is installed, which is newer than this setup.",c->instVersion);
 if(c->running&&!(c->installed&&vercmp(c->instVersion,SETUP_VERSION)>0)){size_t l=wcslen(out);swprintf(out+l,n-l,L"  \x00b7  Open now: Setup closes it first.");}
}
/* A part to install, like a card in the app's theme gallery: chosen = Steam's active blue outline. */
static void drawCard(HDC dc,HWND h,RECT r,UINT st){
 Comp *c=&g_comp[compIndex(GetDlgCtrlID(h))];BOOL on=Button_GetCheck(h)==BST_CHECKED,dis=!IsWindowEnabled(h),hot=(st&CDIS_HOT)!=0&&!dis;
 fill(dc,r,C_BODY);
 RECT card=r;InflateRect(&card,-S(2),-S(2));
 if(on){RECT ring=r;fill(dc,ring,C_ACTIVE);InflateRect(&ring,-S(3),-S(3));fill(dc,ring,hot?C_CARD_HOT:C_CARD);notch(dc,r,C_BODY);}
 else{box(dc,card,hot?C_CARD_HOT:C_CARD,hot?C_LINE_HOT:C_LINE,1);notch(dc,card,C_BODY);}
 COLORREF bg=hot?C_CARD_HOT:C_CARD;
 int L=r.left+S(20),R=r.right-S(20);
 drawArt(dc,c->chrome?310:320,L,r.top+S(20),S(48),S(48));
 RECT b={R-S(18),r.top+S(22),R,r.top+S(40)};tickBox(dc,b,on,hot,dis,bg);
 int X=L+S(62);
 RECT t={X,r.top+S(20),b.left-S(8),r.top+S(42)};text(dc,f_bold,dis?C_INK3:C_WHITE,t,c->title,DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS);
 int x=tag(dc,X,r.top+S(48),c->tag,C_INK3,C_TAG);
 if(!c->chrome)tag(dc,x+S(6),r.top+S(48),L"RECOMMENDED",C_LIME,C_GREEN_B);
 RECT d={L,r.top+S(86),R,r.bottom-S(56)};text(dc,f_body,dis?C_INK3:C_INK2,d,c->desc,DT_WORDBREAK|DT_END_ELLIPSIS);
 wchar_t s[300];COLORREF col;cardStatus(c,s,300,&col);
 RECT line={L,r.bottom-S(48),R,r.bottom-S(47)};grad(dc,line,C_SOFT,bg,FALSE);
 RECT q={L,r.bottom-S(40),R,r.bottom-S(8)};text(dc,f_small,dis?C_INK3:col,q,s,DT_WORDBREAK|DT_END_ELLIPSIS);
 if(st&CDIS_FOCUS&&!(SendMessageW(h,WM_QUERYUISTATE,0,0)&UISF_HIDEFOCUS))focusRing(dc,r);
}
static void drawCheck(HDC dc,HWND h,RECT r,UINT st,COLORREF bg){
 BOOL on=Button_GetCheck(h)==BST_CHECKED,hot=(st&CDIS_HOT)!=0;fill(dc,r,bg);
 int bs=S(16),y=r.top+(r.bottom-r.top-bs)/2;RECT b={r.left+S(2),y,r.left+S(2)+bs,y+bs};
 tickBox(dc,b,on,hot,FALSE,bg);
 wchar_t s[200];GetWindowTextW(h,s,200);RECT t={b.right+S(10),r.top,r.right,r.bottom};
 text(dc,f_label,hot?C_WHITE:C_INK,t,s,DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS);
 if(st&CDIS_FOCUS&&!(SendMessageW(h,WM_QUERYUISTATE,0,0)&UISF_HIDEFOCUS)){
  RECT ring={b.left-S(3),r.top+S(1),min(r.right,t.left+measure(dc,f_label,s)+S(4)),r.bottom-S(1)};frame(dc,ring,C_INK3,1);}
}
/* Buttons as in the app: Steam's green for the main action, the quiet .secondary for the rest; both
   take Steam's blue fade on hover. */
static void drawButton(HDC dc,HWND h,RECT r,UINT st){
 int id=GetDlgCtrlID(h);BOOL hot=(st&CDIS_HOT)!=0,down=(st&CDIS_SELECTED)!=0,dis=(st&CDIS_DISABLED)!=0;
 wchar_t s[120];GetWindowTextW(h,s,120);
 HWND parent=GetParent(h);POINT pt={0,0};MapWindowPoints(h,parent,&pt,1);
 BOOL inFoot=pt.y>S(H_LOGICAL-FOOT_H);COLORREF bg=inFoot?C_FOOT:C_CARD;
 fill(dc,r,bg);
 RECT b=r;COLORREF ink;
 if(id==IDOK){
  if(dis){box(dc,b,RGB(0x32,0x42,0x1e),RGB(0x2b,0x37,0x1c),1);ink=RGB(0x7f,0x81,0x86);}
  else{COLORREF t=hot?C_GREEN_HT:C_GREEN_T,u=hot?C_GREEN_HB:C_GREEN_B;fill(dc,b,C_GREEN_LN);RECT in=b;InflateRect(&in,-1,-1);grad(dc,in,down?u:t,down?t:u,TRUE);ink=C_WHITE;}
 }else{
  if(dis){fill(dc,b,inFoot?C_BTN_FOOT:C_BTN_CARD);ink=C_INK3;}
  else if(hot||down){diag(dc,b,C_BLUE_D,C_BLUE_L);ink=C_WHITE;}
  else{fill(dc,b,inFoot?C_BTN_FOOT:C_BTN_CARD);ink=C_INK;}
 }
 notch(dc,b,bg);
 if(down){OffsetRect(&b,0,S(1));}
 text(dc,f_btn,ink,b,s,DT_SINGLELINE|DT_VCENTER|DT_CENTER);
 if(st&CDIS_FOCUS&&!(SendMessageW(h,WM_QUERYUISTATE,0,0)&UISF_HIDEFOCUS))focusRing(dc,r);
}

static void rowStatus(Comp *c,wchar_t *s,size_t n,COLORREF *col){
 *col=C_INK2;LONGLONG got=c->got,total=c->total;wchar_t a[32],b[32];
 switch(c->state){
  case S_QUEUED:swprintf(s,n,L"Waiting");break;
  case S_LOCATE:swprintf(s,n,L"Getting ready");break;
  case S_DOWNLOAD:{mb(a,32,got);mb(b,32,total);DWORD ms=GetTickCount()-c->t0;double rate=ms>500?got/1048576.0/(ms/1000.0):0;
   if(rate>0)swprintf(s,n,L"Downloading  \x00b7  %ls of %ls  \x00b7  %.1f MB/s",a,b,rate);else swprintf(s,n,L"Downloading  \x00b7  %ls of %ls",a,b);*col=C_INK;break;}
  case S_VERIFY:swprintf(s,n,L"Checking the file against this version's SHA-256");*col=C_INK;break;
  case S_INSTALL:if(c->chrome){swprintf(s,n,L"Unpacking to %ls",g_chromeDir);*col=C_INK;break;}
   swprintf(s,n,c->installed?L"Updating  \x00b7  your settings, keys and themes stay as they are":L"Installing");*col=C_INK;break;
  case S_DONE:if(c->chrome)swprintf(s,n,c->before?L"Updated to %ls  \x00b7  now press Reload on Tyler in Chrome":L"Unpacked  \x00b7  %ls  \x00b7  one last step in Chrome (Finish opens it)",c->instVersion);
   else swprintf(s,n,L"Installed  \x00b7  version %ls",c->instVersion);*col=C_SUCCESS;break;
  case S_FAILED:if(c->chrome&&c->installed)swprintf(s,n,L"Not finished  \x00b7  Retry unpacks it again");else if(c->installed)swprintf(s,n,L"Not changed  \x00b7  version %ls is still installed",c->instVersion);else swprintf(s,n,L"Not installed");*col=C_RED;break;
  case S_CANCELLED:swprintf(s,n,L"Cancelled  \x00b7  nothing was changed");*col=C_INK3;break;
  default:s[0]=0;
 }
}
static int rowTop(int slot){return 184+slot*124;}
/* A progress bar like the app's meters: dark inset track, Steam's blue fill (--rt-meter). */
static void bar(HDC dc,RECT track,double frac,COLORREF a,COLORREF b,BOOL sheen){
 fill(dc,track,C_EDGE);RECT in=track;InflateRect(&in,-1,-1);fill(dc,in,C_TRACK);
 if(frac<=0)return;if(frac>1)frac=1;RECT f=in;f.right=f.left+(LONG)((in.right-in.left)*frac);if(f.right<=f.left)return;
 grad(dc,f,a,b,FALSE);
 if(sheen){int w=f.right-f.left,seg=S(60),pos=(g_anim*S(5))%(w+seg)-seg;RECT g={max(f.left,f.left+pos),f.top,min(f.right,f.left+pos+seg),f.bottom};if(g.right>g.left)alphaFill(dc,g,C_WHITE,50);}
}
static void paint(HDC dc,RECT cl){
 /* Header: Tyler's own entry, as at the top of the panel in Steam chat: the store gradient, the
    framed avatar, the name in online blue and a tracked line under it. */
 RECT head={0,0,cl.right,S(HEAD_H)};grad(dc,head,C_HEAD_A,C_BODY,TRUE);
 RECT av=rc(32,16,56,56);fill(dc,av,C_FRAME);RECT avIn=av;InflateRect(&avIn,-S(2),-S(2));fill(dc,avIn,C_BODY);notch(dc,av,C_HEAD_A);
 drawLogo(dc,av.left+S(4),av.top+S(4),S(48));
 textT(dc,f_title,C_NAME,rc(104,20,560,28),L"ROBOTIC TYLER",DT_SINGLELINE|DT_VCENTER,track(21,8));
 wchar_t ver[60];swprintf(ver,60,L"SETUP  \x00b7  VERSION %ls  \x00b7  WINDOWS 10 AND 11",SETUP_VERSION);
 textT(dc,f_sub,C_NAME_SUB,rc(105,50,560,18),ver,DT_SINGLELINE|DT_VCENTER,track(11,6));
 /* Body */
 RECT body={0,S(HEAD_H),cl.right,S(H_LOGICAL-FOOT_H)};fill(dc,body,C_BODY);
 if(g_page==P_CHOOSE){
  textT(dc,f_h1,C_WHITE,rc(32,100,696,34),L"CHOOSE WHAT TO INSTALL",DT_SINGLELINE|DT_VCENTER,track(26,2));
  text(dc,f_body14,C_INK3,rc(32,136,696,40),L"Pick one or both. Each installs and updates on its own, and you can run Setup again to add the other.",DT_WORDBREAK);
  text(dc,f_small,C_INK3,rc(360,436,368,24),L"Settings, keys and themes on this PC are kept.",DT_SINGLELINE|DT_VCENTER|DT_RIGHT|DT_END_ELLIPSIS);
 }else{
  BOOL busy=g_busy,anyFail=FALSE,anyDone=FALSE,anyCancel=FALSE;
  for(int i=0;i<NCOMP;i++)if(g_comp[i].inRun){anyFail|=g_comp[i].state==S_FAILED;anyDone|=g_comp[i].state==S_DONE;anyCancel|=g_comp[i].state==S_CANCELLED;}
  const wchar_t *h=busy?(g_cancel?L"CANCELLING\x2026":L"INSTALLING\x2026"):anyFail?L"SOMETHING DIDN'T INSTALL":anyCancel&&!anyDone?L"CANCELLED":L"YOU'RE ALL SET";
  int hx=32;
  if(!busy&&!anyFail&&anyDone){RECT ok=rc(32,104,26,26);fill(dc,ok,C_GREEN_LN);RECT in=ok;InflateRect(&in,-1,-1);grad(dc,in,C_GREEN_T,C_GREEN_B,TRUE);notch(dc,ok,C_BODY);tick(dc,ok.left+S(2),ok.top+S(2),S(22),C_WHITE);hx=70;}
  textT(dc,f_h1,C_WHITE,rc(hx,100,696-(hx-32),34),h,DT_SINGLELINE|DT_VCENTER,track(26,2));
  Comp *ch=&g_comp[K_CHROME],*vo=&g_comp[K_DESKTOP];
  const wchar_t *sub2=busy?L"App downloads come from the ROBOTIC TYLER release on GitHub and are checked against this version's SHA-256 before they run.":
   anyFail?L"The details are below. Retry tries that part again; anything already installed stays installed.":
   !anyDone?L"Nothing was changed on this PC.":
   (ch->inRun&&ch->state==S_DONE&&ch->before)?L"In Chrome, press Reload on Tyler's card so it uses the new files. Finish opens the extensions page.":
   (ch->inRun&&ch->state==S_DONE&&!ch->before)?L"Last step for Chrome: Finish opens its extensions page. Turn on Developer mode, click Load unpacked and paste the folder path (Setup copies it).":
   (vo->inRun&&vo->state==S_DONE)?L"Find ROBOTIC TYLER in the Start menu. For voice, open Tyler's panel in its Steam chat and press Connect & start, then join a voice channel. No VB-CABLE needed.":
   L"Find ROBOTIC TYLER in the Start menu. Run Setup again any time to add or repair a part.";
  text(dc,f_body14,C_INK3,rc(32,136,696,40),sub2,DT_WORDBREAK);
  int slot=0;
  for(int i=0;i<NCOMP;i++){Comp *c=&g_comp[i];if(!c->inRun)continue;int y=rowTop(slot++);
   RECT row=rc(32,y,696,112);box(dc,row,C_CARD,C_LINE,1);notch(dc,row,C_BODY);
   /* the state as a bar down the left edge, like the selected page in the app's sidebar */
   COLORREF edge=c->state==S_DONE?C_SUCCESS:c->state==S_FAILED?C_RED:c->state==S_CANCELLED||c->state==S_QUEUED?C_LINE_HOT:C_ACTIVE;
   RECT lb=rc(32,y,3,112);fill(dc,lb,edge);
   drawArt(dc,c->chrome?310:320,S(52),S(y+18),S(48),S(48));
   RECT t=rc(120,y+14,440,26);text(dc,f_bold,C_WHITE,t,c->title,DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS);
   const wchar_t *badge=c->state==S_DONE?L"DONE":c->state==S_FAILED?L"FAILED":c->state==S_CANCELLED?L"CANCELLED":c->state==S_QUEUED?L"WAITING":L"WORKING";
   int bx=S(120)+measure(dc,f_bold,c->title)+S(10),by=S(y+19);
   if(c->state==S_DONE)tag(dc,bx,by,badge,C_LIME,C_GREEN_B);else if(c->state==S_FAILED)tag(dc,bx,by,badge,C_RED_INK,C_RED_BG);
   else if(c->state==S_CANCELLED||c->state==S_QUEUED)tag(dc,bx,by,badge,C_INK3,C_TAG);else tag(dc,bx,by,badge,C_LINK,C_BLUE_TAG);
   wchar_t s[300];COLORREF col;EnterCriticalSection(&g_lock);rowStatus(c,s,300,&col);LeaveCriticalSection(&g_lock);
   text(dc,f_body,col,rc(120,y+40,480,20),s,DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS);
   RECT trk=rc(120,y+66,592,8);
   double frac=c->total>0?(double)c->got/(double)c->total:0;
   if(c->state==S_DONE)bar(dc,trk,1,C_GREEN_T,C_SUCCESS,FALSE);
   else if(c->state==S_DOWNLOAD||c->state==S_VERIFY)bar(dc,trk,frac,C_BLUE_D,C_BLUE_L,TRUE);
   else if(c->state==S_INSTALL||c->state==S_LOCATE){bar(dc,trk,0,C_BLUE_D,C_BLUE_L,FALSE);RECT in=trk;InflateRect(&in,-1,-1);int w=in.right-in.left,seg=w/4,pos=(g_anim*S(6))%(w+seg)-seg;
    RECT m={max(in.left,in.left+pos),in.top,min(in.right,in.left+pos+seg),in.bottom};if(m.right>m.left)grad(dc,m,C_BLUE_D,C_BLUE_L,FALSE);}
   else if(c->state==S_FAILED)bar(dc,trk,frac>0?frac:1,C_RED_D,C_RED_L,FALSE);
   else bar(dc,trk,0,C_BLUE_D,C_BLUE_L,FALSE);
   if(c->state==S_FAILED){EnterCriticalSection(&g_lock);text(dc,f_small,C_RED,rc(120,y+78,592,32),c->error,DT_WORDBREAK|DT_END_ELLIPSIS);LeaveCriticalSection(&g_lock);}
  }
 }
 /* Footer: the settings page's save bar */
 RECT foot={0,S(H_LOGICAL-FOOT_H),cl.right,cl.bottom};fill(dc,foot,C_FOOT);
 RECT line={0,S(H_LOGICAL-FOOT_H),cl.right,S(H_LOGICAL-FOOT_H)+1};fill(dc,line,C_EDGE);
 text(dc,f_small,C_INK3,rc(32,H_LOGICAL-56,400,40),L"Unofficial fan project. Not affiliated with or endorsed by Valve.\nSteam is a trademark of Valve Corporation.",DT_WORDBREAK);
}

/* ── Layout, fonts, pages ────────────────────────────────────────────────── */
static HFONT font(int px,int weight,const wchar_t *face){
 return CreateFontW(-S(px),0,0,0,weight,0,0,0,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH|FF_SWISS,face);
}
/* Arial, as the app shows on Windows (its Steam theme asks for "Motiva Sans", Arial: Steam's own
   face only exists inside Steam). */
static void makeFonts(void){
 HFONT *all[]={&f_title,&f_sub,&f_h1,&f_body,&f_body14,&f_label,&f_bold,&f_small,&f_btn,&f_tag};for(int i=0;i<10;i++)if(*all[i]){DeleteObject(*all[i]);*all[i]=NULL;}
 f_title=font(21,FW_BOLD,L"Arial");f_sub=font(11,FW_NORMAL,L"Arial");f_h1=font(26,FW_NORMAL,L"Arial");
 f_body=font(13,FW_NORMAL,L"Arial");f_body14=font(14,FW_NORMAL,L"Arial");f_label=font(14,FW_NORMAL,L"Arial");f_bold=font(15,FW_BOLD,L"Arial");
 f_small=font(12,FW_NORMAL,L"Arial");f_btn=font(14,FW_NORMAL,L"Arial");f_tag=font(10,FW_BOLD,L"Arial");
 for(int i=0;i<NCOMP;i++){HWND k[3]={g_comp[i].card,g_comp[i].retry,g_comp[i].launch};for(int j=0;j<3;j++)if(k[j])SendMessageW(k[j],WM_SETFONT,(WPARAM)f_body,FALSE);}
 HWND kids[]={g_desktop,g_ok,g_cancelBtn};for(int i=0;i<3;i++)if(kids[i])SendMessageW(kids[i],WM_SETFONT,(WPARAM)f_body,FALSE);
}
static void place(HWND h,int x,int y,int w,int hgt,BOOL show){SetWindowPos(h,NULL,S(x),S(y),S(w),S(hgt),SWP_NOZORDER|SWP_NOACTIVATE);ShowWindow(h,show?SW_SHOWNA:SW_HIDE);}
static void cardName(Comp *c){wchar_t s[700],st[300];COLORREF col;cardStatus(c,st,300,&col);swprintf(s,700,L"%ls (%ls). %ls %ls",c->title,c->tag,c->desc,st);SetWindowTextW(c->card,s);}
static void layout(void){
 BOOL choose=g_page==P_CHOOSE,done=!g_busy;
 for(int i=0;i<NCOMP;i++){place(g_comp[i].card,32+i*356,184,340,236,choose);cardName(&g_comp[i]);}
 place(g_desktop,32,436,360,24,choose);
 int slot=0;
 for(int i=0;i<NCOMP;i++){Comp *c=&g_comp[i];BOOL row=!choose&&c->inRun;int y=rowTop(row?slot:0);if(row)slot++;
  BOOL failed=row&&done&&c->state==S_FAILED;
  place(c->retry,624,y+12,88,30,failed);
  BOOL ok=row&&done&&c->state==S_DONE;wchar_t lt[160];
  if(c->chrome)swprintf(lt,160,L"Open Chrome's extensions page and this folder when I click Finish");else swprintf(lt,160,L"Open %ls when I click Finish",c->title);
  SetWindowTextW(c->launch,lt);
  place(c->launch,120,y+80,560,24,ok);
 }
 if(choose){SetWindowTextW(g_ok,L"Install");SetWindowTextW(g_cancelBtn,L"Cancel");place(g_cancelBtn,476,H_LOGICAL-54,116,36,TRUE);place(g_ok,604,H_LOGICAL-54,124,36,TRUE);
  BOOL any=FALSE;for(int i=0;i<NCOMP;i++)any|=Button_GetCheck(g_comp[i].card)==BST_CHECKED;EnableWindow(g_ok,any);}
 else if(!done){SetWindowTextW(g_cancelBtn,g_cancel?L"Cancelling\x2026":L"Cancel");EnableWindow(g_cancelBtn,!g_cancel);place(g_cancelBtn,612,H_LOGICAL-54,116,36,TRUE);place(g_ok,604,H_LOGICAL-54,124,36,FALSE);}
 else{BOOL any=FALSE;for(int i=0;i<NCOMP;i++)any|=g_comp[i].inRun&&g_comp[i].state==S_DONE;
  SetWindowTextW(g_ok,any?L"Finish":L"Close");EnableWindow(g_ok,TRUE);place(g_cancelBtn,476,H_LOGICAL-54,116,36,FALSE);place(g_ok,604,H_LOGICAL-54,124,36,TRUE);}
 InvalidateRect(g_wnd,NULL,FALSE);
 /* Screen readers: the window title carries the overall state. */
 wchar_t title[400]=L"ROBOTIC TYLER Setup";
 if(!choose){for(int i=0;i<NCOMP;i++){Comp *c=&g_comp[i];if(!c->inRun)continue;wchar_t s[300];COLORREF col;rowStatus(c,s,300,&col);size_t l=wcslen(title);swprintf(title+l,400-l,L" \x2014 %ls: %ls",c->title,s);}}
 SetWindowTextW(g_wnd,title);
}
static void refreshDetection(void){for(int i=0;i<NCOMP;i++){detect(&g_comp[i]);EnableWindow(g_comp[i].card,!(g_comp[i].installed&&vercmp(g_comp[i].instVersion,SETUP_VERSION)>0));}}

static BOOL confirmRunning(void){
 wchar_t names[200]=L"";int n=0;
 for(int i=0;i<NCOMP;i++){Comp *c=&g_comp[i];if(c->selected&&!c->chrome&&isRunning(c->exe)){if(n++)wcscat(names,L" and ");wcscat(names,c->title);}}
 if(!n||g_auto)return TRUE;
 wchar_t msg[600];swprintf(msg,600,L"%ls %ls open. Setup will close %ls before installing, and you can open %ls again afterwards. Nothing you've saved is lost.\n\nContinue?",names,n>1?L"are":L"is",n>1?L"them":L"it",n>1?L"them":L"it");
 return MessageBoxW(g_wnd,msg,L"ROBOTIC TYLER Setup",MB_OKCANCEL|MB_ICONINFORMATION)==IDOK;
}
static void startRun(int only){
 if(InterlockedCompareExchange(&g_busy,1,0))return;
 g_cancel=0;
 for(int i=0;i<NCOMP;i++){Comp *c=&g_comp[i];
  if(only<0){c->inRun=c->selected;}
  if(c->inRun&&(only<0||only==i)){c->state=S_QUEUED;c->got=c->total=0;c->error[0]=c->detail[0]=0;c->before=c->installed;}}
 g_page=P_WORK;layout();SetFocus(g_cancelBtn);
 SetTimer(g_wnd,TIMER_ANIM,40,NULL);
 HANDLE t=CreateThread(NULL,0,worker,NULL,0,NULL);if(t)CloseHandle(t);else{InterlockedExchange(&g_busy,0);PostMessageW(g_wnd,WM_APP_DONE,0,0);}
}
static void onInstall(void){
 BOOL any=FALSE;for(int i=0;i<NCOMP;i++){g_comp[i].selected=Button_GetCheck(g_comp[i].card)==BST_CHECKED&&IsWindowEnabled(g_comp[i].card);any|=g_comp[i].selected;}
 if(!any)return;
 g_runDesktop=Button_GetCheck(g_desktop)==BST_CHECKED;
 if(!confirmRunning())return;
 logLine(L"install: chrome=%d desktop-app=%d shortcuts=%d",g_comp[K_CHROME].selected,g_comp[K_DESKTOP].selected,g_runDesktop);
 startRun(-1);
}
static void copyText(const wchar_t *t){
 if(!OpenClipboard(g_wnd))return;EmptyClipboard();size_t bytes=(wcslen(t)+1)*sizeof(wchar_t);HGLOBAL g=GlobalAlloc(GMEM_MOVEABLE,bytes);
 if(g){void *d=GlobalLock(g);memcpy(d,t,bytes);GlobalUnlock(g);if(!SetClipboardData(CF_UNICODETEXT,g))GlobalFree(g);}CloseClipboard();
}
static BOOL findChrome(wchar_t *out){
 static const wchar_t *K=L"Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe";
 if(regStr(HKEY_CURRENT_USER,0,K,L"",out,MAX_PATH)&&fileExists(out))return TRUE;
 if(regStr(HKEY_LOCAL_MACHINE,KEY_WOW64_64KEY,K,L"",out,MAX_PATH)&&fileExists(out))return TRUE;
 if(regStr(HKEY_LOCAL_MACHINE,KEY_WOW64_32KEY,K,L"",out,MAX_PATH)&&fileExists(out))return TRUE;
 const wchar_t *env[]={L"ProgramFiles",L"ProgramFiles(x86)",L"LOCALAPPDATA"};
 for(int i=0;i<3;i++){wchar_t base[MAX_PATH];if(GetEnvironmentVariableW(env[i],base,MAX_PATH)){swprintf(out,MAX_PATH,L"%ls\\Google\\Chrome\\Application\\chrome.exe",base);if(fileExists(out))return TRUE;}}
 return FALSE;
}
/* Last step for the extension: Chrome only adds an unpacked folder by hand, so open both and copy the path. */
static void openChrome(Comp *c){
 copyText(g_chromeDir);
 ShellExecuteW(NULL,L"open",g_chromeDir,NULL,NULL,SW_SHOWNORMAL);
 wchar_t exe[MAX_PATH];
 if(findChrome(exe)){wchar_t cmd[2*MAX_PATH];swprintf(cmd,2*MAX_PATH,L"\"%ls\" chrome://extensions/",exe);STARTUPINFOW si={sizeof si};PROCESS_INFORMATION pi;
  if(CreateProcessW(exe,cmd,NULL,NULL,FALSE,0,NULL,NULL,&si,&pi)){CloseHandle(pi.hThread);CloseHandle(pi.hProcess);logLine(L"chrome: opened the extensions page");return;}}
 logLine(L"chrome: Chrome not found");
 MessageBoxW(g_wnd,L"Chrome wasn't found on this PC. Install Google Chrome, open chrome://extensions, turn on Developer mode, click Load unpacked and choose this folder (its path is copied):\n\n%LOCALAPPDATA%\\ROBOTIC TYLER\\Chrome extension",L"ROBOTIC TYLER Setup",MB_OK|MB_ICONINFORMATION);
 (void)c;
}
static void finish(void){
 for(int i=0;i<NCOMP;i++){Comp *c=&g_comp[i];
  if(c->chrome){if(c->inRun&&c->state==S_DONE&&Button_GetCheck(c->launch)==BST_CHECKED)openChrome(c);continue;}
  if(c->inRun&&c->state==S_DONE&&Button_GetCheck(c->launch)==BST_CHECKED&&c->instDir[0]){
   wchar_t exe[MAX_PATH];swprintf(exe,MAX_PATH,L"%ls\\%ls",c->instDir,c->exe);
   HINSTANCE r=ShellExecuteW(NULL,L"open",exe,NULL,c->instDir,SW_SHOWNORMAL);logLine(L"%ls: open %ls -> %d",c->key,exe,(int)(INT_PTR)r);}}
 DestroyWindow(g_wnd);
}
static BOOL askStop(void){
 if(!g_busy)return TRUE;if(g_cancel)return FALSE;
 if(g_auto||MessageBoxW(g_wnd,L"Stop Setup? An app that's still downloading won't be installed. Anything already installing or unpacking finishes first.",L"ROBOTIC TYLER Setup",MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2)==IDYES){
  InterlockedExchange(&g_cancel,1);logLine(L"cancel requested");layout();}
 return FALSE;
}

/* ── Window ──────────────────────────────────────────────────────────────── */
static HWND mk(const wchar_t *cls,const wchar_t *txt,DWORD style,int id){
 HWND h=CreateWindowExW(0,cls,txt,WS_CHILD|WS_TABSTOP|WS_GROUP|style,0,0,10,10,g_wnd,(HMENU)(INT_PTR)id,g_inst,NULL);
 SendMessageW(h,WM_SETFONT,(WPARAM)f_body,FALSE);return h;
}
static void darkTitle(HWND h){
 HMODULE d=LoadLibraryW(L"dwmapi.dll");if(!d)return;
 typedef HRESULT (WINAPI *Set)(HWND,DWORD,LPCVOID,DWORD);Set set=(Set)(void*)GetProcAddress(d,"DwmSetWindowAttribute");
 if(set){BOOL on=TRUE;set(h,20,&on,sizeof on);COLORREF cap=C_HEAD_A;set(h,35,&cap,sizeof cap);}
}
static int dpiOf(HWND h){
 typedef UINT (WINAPI *Get)(HWND);static Get get=NULL;static BOOL tried=FALSE;
 if(!tried){tried=TRUE;get=(Get)(void*)GetProcAddress(GetModuleHandleW(L"user32.dll"),"GetDpiForWindow");}
 if(get&&h)return (int)get(h);HDC dc=GetDC(NULL);int d=GetDeviceCaps(dc,LOGPIXELSY);ReleaseDC(NULL,dc);return d;
}
static LRESULT CALLBACK wndProc(HWND h,UINT m,WPARAM w,LPARAM l){
 switch(m){
 case WM_CREATE:{
  g_wnd=h;darkTitle(h);g_dpi=dpiOf(h);makeFonts();
  for(int i=0;i<NCOMP;i++){Comp *c=&g_comp[i];
   c->card=mk(WC_BUTTONW,c->title,BS_AUTOCHECKBOX|BS_MULTILINE,IDC_CARD0+i);}
  g_desktop=mk(WC_BUTTONW,L"Add a desktop shortcut",BS_AUTOCHECKBOX,IDC_DESKTOP);
  for(int i=0;i<NCOMP;i++){Comp *c=&g_comp[i];c->retry=mk(WC_BUTTONW,L"Retry",BS_PUSHBUTTON,IDC_RETRY0+i);c->launch=mk(WC_BUTTONW,L"Open",BS_AUTOCHECKBOX,IDC_LAUNCH0+i);Button_SetCheck(c->launch,BST_CHECKED);}
  g_cancelBtn=mk(WC_BUTTONW,L"Cancel",BS_PUSHBUTTON,IDCANCEL);
  g_ok=mk(WC_BUTTONW,L"Install",BS_DEFPUSHBUTTON,IDOK);
  refreshDetection();
  /* Preselect: /components=…, else what's out of date, else what's missing, else both. */
  BOOL any=FALSE,outdated=FALSE;for(int i=0;i<NCOMP;i++){any|=g_comp[i].installed;outdated|=g_comp[i].installed&&vercmp(g_comp[i].instVersion,SETUP_VERSION)<0;}
  for(int i=0;i<NCOMP;i++){Comp *c=&g_comp[i];BOOL on;
   if(g_preselect[0])on=wcsstr(g_preselect,c->key)!=NULL||(i==K_DESKTOP&&(wcsstr(g_preselect,L"control")||wcsstr(g_preselect,L"voice")));
   else if(c->installed)on=vercmp(c->instVersion,SETUP_VERSION)<0;  /* update what's out of date */
   else on=any?!outdated:TRUE;
   Button_SetCheck(c->card,on&&IsWindowEnabled(c->card)?BST_CHECKED:BST_UNCHECKED);}
  Button_SetCheck(g_desktop,g_noDesktop?BST_UNCHECKED:BST_CHECKED);
  layout();return 0;}
 case WM_NOTIFY:{
  NMHDR *n=(NMHDR*)l;
  if(n->code==NM_CUSTOMDRAW){NMCUSTOMDRAW *cd=(NMCUSTOMDRAW*)l;
   if(cd->dwDrawStage==CDDS_PREPAINT){int id=(int)n->idFrom;
    if(INRANGE(id,IDC_CARD0))drawCard(cd->hdc,n->hwndFrom,cd->rc,cd->uItemState);
    else if(id==IDC_DESKTOP)drawCheck(cd->hdc,n->hwndFrom,cd->rc,cd->uItemState,C_BODY);
    else if(INRANGE(id,IDC_LAUNCH0))drawCheck(cd->hdc,n->hwndFrom,cd->rc,cd->uItemState,C_CARD);
    else drawButton(cd->hdc,n->hwndFrom,cd->rc,cd->uItemState);
    return CDRF_SKIPDEFAULT;}}
  break;}
 case WM_COMMAND:{
  int id=LOWORD(w);
  if(INRANGE(id,IDC_CARD0)){layout();InvalidateRect((HWND)l,NULL,TRUE);InvalidateRect(h,NULL,FALSE);}
  else if(id==IDC_DESKTOP||INRANGE(id,IDC_LAUNCH0))InvalidateRect((HWND)l,NULL,TRUE);
  else if(INRANGE(id,IDC_RETRY0)){int i=id-IDC_RETRY0;logLine(L"%ls: retry",g_comp[i].key);startRun(i);}
  else if(id==IDOK){if(g_page==P_CHOOSE){if(IsWindowEnabled(g_ok))onInstall();}else if(!g_busy)finish();}
  else if(id==IDCANCEL){if(g_page==P_CHOOSE)DestroyWindow(h);else if(g_busy)askStop();else finish();}
  return 0;}
 case WM_APP_PROGRESS:{RECT r=rc(0,HEAD_H,W_LOGICAL,H_LOGICAL-FOOT_H-HEAD_H);InvalidateRect(h,&r,FALSE);
  if(g_page==P_WORK){wchar_t t[200]=L"ROBOTIC TYLER Setup";for(int i=0;i<NCOMP;i++){Comp *c=&g_comp[i];if(c->inRun&&(c->state==S_DOWNLOAD||c->state==S_VERIFY)&&c->total){size_t n=wcslen(t);swprintf(t+n,200-n,L" \x2014 %ls %d%%",c->title,(int)(c->got*100/c->total));}}SetWindowTextW(h,t);}
  return 0;}
 case WM_APP_ROW:layout();return 0;
 case WM_APP_DONE:{
  BOOL anyFail=FALSE,anyDone=FALSE;for(int i=0;i<NCOMP;i++)if(g_comp[i].inRun){anyFail|=g_comp[i].state!=S_DONE;anyDone|=g_comp[i].state==S_DONE;}
  g_exitCode=anyFail?(g_cancel?2:1):0;logLine(L"finished: exit code %d",g_exitCode);
  KillTimer(h,TIMER_ANIM);layout();
  HWND first=NULL;for(int i=0;i<NCOMP&&!first;i++)if(g_comp[i].inRun&&g_comp[i].state==S_FAILED)first=g_comp[i].retry;
  SetFocus(first?first:g_ok);
  if(g_auto)SetTimer(h,TIMER_AUTOCLOSE,1500,NULL);
  FLASHWINFO fw={sizeof fw,h,FLASHW_TRAY|FLASHW_TIMERNOFG,3,0};FlashWindowEx(&fw);
  (void)anyDone;return 0;}
 case WM_TIMER:
  if(w==TIMER_ANIM){g_anim++;if(g_page==P_WORK){RECT r=rc(0,HEAD_H,W_LOGICAL,H_LOGICAL-FOOT_H-HEAD_H);InvalidateRect(h,&r,FALSE);}}
  else if(w==TIMER_AUTOCLOSE){KillTimer(h,TIMER_AUTOCLOSE);DestroyWindow(h);}
  return 0;
 case DM_GETDEFID:{ /* Enter presses the focused button (Retry, Cancel); otherwise the main action */
  HWND f=GetFocus();int id=f&&GetParent(f)==h?GetDlgCtrlID(f):0;
  if(id==IDCANCEL||INRANGE(id,IDC_RETRY0))return MAKELRESULT(id,DC_HASDEFID);
  return MAKELRESULT(IDOK,DC_HASDEFID);}
 case WM_ERASEBKGND:return 1;
 case WM_PAINT:{
  PAINTSTRUCT ps;HDC dc=BeginPaint(h,&ps);RECT cl;GetClientRect(h,&cl);
  HDC m=CreateCompatibleDC(dc);HBITMAP b=CreateCompatibleBitmap(dc,cl.right,cl.bottom);HGDIOBJ o=SelectObject(m,b);
  paint(m,cl);BitBlt(dc,0,0,cl.right,cl.bottom,m,0,0,SRCCOPY);
  SelectObject(m,o);DeleteObject(b);DeleteDC(m);EndPaint(h,&ps);return 0;}
 case WM_DPICHANGED:{
  g_dpi=HIWORD(w);makeFonts();RECT *r=(RECT*)l;
  SetWindowPos(h,NULL,r->left,r->top,r->right-r->left,r->bottom-r->top,SWP_NOZORDER|SWP_NOACTIVATE);layout();return 0;}
 case WM_CLOSE:if(g_page==P_WORK&&g_busy){askStop();return 0;}DestroyWindow(h);return 0;
 case WM_DESTROY:PostQuitMessage(g_exitCode);return 0;
 }
 return DefWindowProcW(h,m,w,l);
}

int WINAPI wWinMain(HINSTANCE inst,HINSTANCE prev,PWSTR cmd,int show){
 (void)prev;(void)cmd;g_inst=inst;InitializeCriticalSection(&g_lock);
 HANDLE one=CreateMutexW(NULL,TRUE,L"Local\\RoboticTylerSetup");
 if(GetLastError()==ERROR_ALREADY_EXISTS){HWND other=FindWindowW(L"RoboticTylerSetup",NULL);if(other){ShowWindow(other,SW_RESTORE);SetForegroundWindow(other);}return 3;}
 /* Folders, log, command line */
 GetModuleFileNameW(NULL,g_setupDir,MAX_PATH);wchar_t *slash=wcsrchr(g_setupDir,L'\\');if(slash)*slash=0;
 wchar_t tmp[MAX_PATH];GetTempPathW(MAX_PATH,tmp);swprintf(g_tempDir,MAX_PATH,L"%lsROBOTIC TYLER Setup %ls",tmp,SETUP_VERSION);
 size_t tl=wcslen(g_tempDir);if(tl&&g_tempDir[tl-1]==L'\\')g_tempDir[tl-1]=0;CreateDirectoryW(g_tempDir,NULL);
 wcscpy(g_base,DOWNLOAD_BASE);
 wchar_t local[MAX_PATH];if(!GetEnvironmentVariableW(L"LOCALAPPDATA",local,MAX_PATH))SHGetFolderPathW(NULL,CSIDL_LOCAL_APPDATA,NULL,0,local);
 swprintf(g_chromeDir,MAX_PATH,L"%ls\\ROBOTIC TYLER\\Chrome extension",local);swprintf(g_chromeList,MAX_PATH,L"%ls\\ROBOTIC TYLER\\chrome-extension-files.txt",local);
 wchar_t logPath[MAX_PATH];swprintf(logPath,MAX_PATH,L"%ls\\setup.log",g_tempDir);
 int argc=0;LPWSTR *argv=CommandLineToArgvW(GetCommandLineW(),&argc);
 for(int i=1;argv&&i<argc;i++){wchar_t *a=argv[i];if(*a==L'-'||*a==L'/')a++;else continue;
  if(!_wcsnicmp(a,L"source=",7)){wcsncpy(g_source,a+7,1023);}
  else if(!_wcsnicmp(a,L"components=",11)){wcsncpy(g_preselect,a+11,63);_wcslwr(g_preselect);}
  else if(!_wcsicmp(a,L"auto"))g_auto=TRUE;
  else if(!_wcsicmp(a,L"nodesktop"))g_noDesktop=TRUE;
  else if(!_wcsnicmp(a,L"log=",4))wcsncpy(logPath,a+4,MAX_PATH-1);}
 if(argv)LocalFree(argv);
 if(g_source[0]){
  if(!_wcsnicmp(g_source,L"http://",7)||!_wcsnicmp(g_source,L"https://",8)){wcsncpy(g_base,g_source,1000);if(g_base[wcslen(g_base)-1]!=L'/')wcscat(g_base,L"/");}
  else{g_sourceIsFolder=TRUE;size_t n=wcslen(g_source);if(n&&g_source[n-1]==L'\\')g_source[n-1]=0;}
 }
 g_log=CreateFileW(logPath,FILE_APPEND_DATA,FILE_SHARE_READ,NULL,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);
 logLine(L"ROBOTIC TYLER Setup %ls, downloads from %ls%ls",SETUP_VERSION,g_sourceIsFolder?g_source:g_base,g_sourceIsFolder?L" (folder)":L"");

 INITCOMMONCONTROLSEX icc={sizeof icc,ICC_STANDARD_CLASSES};InitCommonControlsEx(&icc);
 WNDCLASSEXW wc={sizeof wc};wc.lpfnWndProc=wndProc;wc.hInstance=inst;wc.lpszClassName=L"RoboticTylerSetup";
 wc.hCursor=LoadCursorW(NULL,(LPCWSTR)IDC_ARROW);wc.hIcon=LoadIconW(inst,MAKEINTRESOURCEW(1));
 wc.hIconSm=(HICON)LoadImageW(inst,MAKEINTRESOURCEW(1),IMAGE_ICON,GetSystemMetrics(SM_CXSMICON),GetSystemMetrics(SM_CYSMICON),0);
 RegisterClassExW(&wc);
 /* Size the window for the monitor the cursor is on. */
 POINT cur;GetCursorPos(&cur);HMONITOR mon=MonitorFromPoint(cur,MONITOR_DEFAULTTOPRIMARY);MONITORINFO mi={sizeof mi};GetMonitorInfoW(mon,&mi);
 typedef HRESULT (WINAPI *GetDpiMon)(HMONITOR,int,UINT*,UINT*);HMODULE sh=LoadLibraryW(L"shcore.dll");GetDpiMon gdm=sh?(GetDpiMon)(void*)GetProcAddress(sh,"GetDpiForMonitor"):NULL;
 UINT dx=96,dy=96;if(gdm&&SUCCEEDED(gdm(mon,0,&dx,&dy)))g_dpi=(int)dy;else g_dpi=dpiOf(NULL);
 DWORD style=WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX|WS_CLIPCHILDREN;
 RECT wr={0,0,S(W_LOGICAL),S(H_LOGICAL)};AdjustWindowRectEx(&wr,style,FALSE,0);
 int ww=wr.right-wr.left,wh=wr.bottom-wr.top,x=mi.rcWork.left+((mi.rcWork.right-mi.rcWork.left)-ww)/2,y=mi.rcWork.top+((mi.rcWork.bottom-mi.rcWork.top)-wh)/2;
 HWND h=CreateWindowExW(0,wc.lpszClassName,L"ROBOTIC TYLER Setup",style,x,y,ww,wh,NULL,NULL,inst,NULL);
 if(!h)return 4;
 /* The real DPI may differ from the estimate: fit the client area exactly. */
 if(dpiOf(h)!=(int)dy){g_dpi=dpiOf(h);makeFonts();RECT r2={0,0,S(W_LOGICAL),S(H_LOGICAL)};AdjustWindowRectEx(&r2,style,FALSE,0);SetWindowPos(h,NULL,0,0,r2.right-r2.left,r2.bottom-r2.top,SWP_NOMOVE|SWP_NOZORDER);layout();}
 ShowWindow(h,show);UpdateWindow(h);
 SetFocus(IsWindowEnabled(g_ok)?g_ok:g_comp[0].card);
 if(g_auto&&IsWindowEnabled(g_ok)){for(int i=0;i<NCOMP;i++)g_comp[i].selected=Button_GetCheck(g_comp[i].card)==BST_CHECKED&&IsWindowEnabled(g_comp[i].card);g_runDesktop=Button_GetCheck(g_desktop)==BST_CHECKED;startRun(-1);}
 else if(g_auto){logLine(L"/auto: nothing to install");g_exitCode=0;DestroyWindow(h);}
 MSG msg;
 while(GetMessageW(&msg,NULL,0,0)>0){if(!IsDialogMessageW(g_wnd,&msg)){TranslateMessage(&msg);DispatchMessageW(&msg);}}
 logLine(L"exit %d",(int)msg.wParam);
 if(g_log!=INVALID_HANDLE_VALUE)CloseHandle(g_log);
 if(one)CloseHandle(one);
 return (int)msg.wParam;
}
