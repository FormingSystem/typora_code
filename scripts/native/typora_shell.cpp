#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shobjidl.h>
#include <shlwapi.h>
#include <shellapi.h>
#include <atomic>
#include <new>
#include <string>

// System COM names are ABI contracts. All other names belong to this adapter.
static const CLSID shell_clsid = {0x28de196c,0x133b,0x4513,{0xaf,0x13,0x21,0xac,0xeb,0x40,0xad,0x51}};
static std::atomic<long> object_count{0};

static std::wstring quote_argument(const std::wstring& value) {
    std::wstring result=L"\"";
    size_t slashes=0;
    for(wchar_t ch:value) {
        if(ch==L'\\') {++slashes; continue;}
        result.append(ch==L'"'?slashes*2+1:slashes,L'\\');
        result+=ch;
        slashes=0;
    }
    result.append(slashes*2,L'\\');
    return result+L'"';
}

static std::wstring get_executable(bool folder) {
    HMODULE module=nullptr;
    if(!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS|GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
        reinterpret_cast<LPCWSTR>(&get_executable),&module))return {};
    wchar_t buffer[32768]={};
    DWORD size=GetModuleFileNameW(module,buffer,32768);
    if(!size||size>=32768)return {};
    std::wstring config=buffer;
    config=config.substr(0,config.find_last_of(L'\\')+1)+L"shell_config.ini";
    if(GetPrivateProfileIntW(L"shell",folder?L"folder_menu":L"file_menu",0,config.c_str())!=1)return {};
    size=GetPrivateProfileStringW(L"shell",L"executable",L"",buffer,32768,config.c_str());
    if(!size||size>=32767)return {};
    std::wstring value=buffer;
    if(value.find(L'"')!=std::wstring::npos || value.size()<11 || _wcsicmp(value.c_str()+value.size()-10,L"Typora.exe")!=0) return {};
    return value;
}

static HRESULT get_target(IShellItemArray* items,std::wstring& path,bool& folder) {
    if(!items) return E_INVALIDARG;
    DWORD count=0;
    HRESULT result=items->GetCount(&count);
    if(FAILED(result) || count!=1) return E_INVALIDARG;
    IShellItem* item=nullptr;
    result=items->GetItemAt(0,&item);
    if(FAILED(result)) return result;
    SFGAOF attributes=0;
    result=item->GetAttributes(SFGAO_FILESYSTEM|SFGAO_FOLDER,&attributes);
    if(SUCCEEDED(result) && (attributes&SFGAO_FILESYSTEM)) {
        PWSTR raw=nullptr;
        result=item->GetDisplayName(SIGDN_FILESYSPATH,&raw);
        if(SUCCEEDED(result)) {path=raw;CoTaskMemFree(raw);folder=(attributes&SFGAO_FOLDER)!=0;}
    } else result=E_INVALIDARG;
    item->Release();
    return result;
}

class shell_command final: public IExplorerCommand {
    std::atomic<ULONG> references{1};
public:
    shell_command(){++object_count;}
    ~shell_command(){--object_count;}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void** output) override {
        if(!output)return E_POINTER;
        *output=nullptr;
        if(iid==IID_IUnknown||iid==IID_IExplorerCommand){*output=static_cast<IExplorerCommand*>(this);AddRef();return S_OK;}
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override {return ++references;}
    ULONG STDMETHODCALLTYPE Release() override {ULONG left=--references;if(!left)delete this;return left;}
    HRESULT STDMETHODCALLTYPE GetTitle(IShellItemArray*,PWSTR* text) override {
        if(!text)return E_POINTER;
        return SHStrDupW(PRIMARYLANGID(GetUserDefaultUILanguage())==LANG_CHINESE?L"\u7528 Typora \u6253\u5f00":L"Open with Typora",text);
    }
    HRESULT STDMETHODCALLTYPE GetIcon(IShellItemArray* items,PWSTR* text) override {
        if(!text)return E_POINTER;*text=nullptr;
        try {std::wstring target;bool folder=true;HRESULT result=items?get_target(items,target,folder):S_OK;if(FAILED(result))return result;
            auto executable=get_executable(folder);return executable.empty()?E_FAIL:SHStrDupW(executable.c_str(),text);
        } catch(...) {return E_OUTOFMEMORY;}
    }
    HRESULT STDMETHODCALLTYPE GetToolTip(IShellItemArray*,PWSTR* text) override {if(!text)return E_POINTER;*text=nullptr;return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE GetCanonicalName(GUID* value) override {if(!value)return E_POINTER;*value=shell_clsid;return S_OK;}
    HRESULT STDMETHODCALLTYPE GetState(IShellItemArray* items,BOOL,EXPCMDSTATE* state) override {
        if(!state)return E_POINTER;*state=ECS_HIDDEN;
        try {std::wstring target;bool folder=true;if((!items||SUCCEEDED(get_target(items,target,folder)))&&!get_executable(folder).empty())*state=ECS_ENABLED;return S_OK;}
        catch(...) {return E_OUTOFMEMORY;}
    }
    HRESULT STDMETHODCALLTYPE Invoke(IShellItemArray* items,IBindCtx*) override {
        try {std::wstring target;bool folder=false;HRESULT result=get_target(items,target,folder);if(FAILED(result))return result;
            auto executable=get_executable(folder);if(executable.empty())return HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND);
            auto arguments=quote_argument(target);
            SHELLEXECUTEINFOW operation={sizeof(operation)};
            operation.fMask=SEE_MASK_FLAG_NO_UI;operation.lpVerb=L"open";operation.lpFile=executable.c_str();operation.lpParameters=arguments.c_str();operation.nShow=SW_SHOWNORMAL;
            return ShellExecuteExW(&operation)?S_OK:HRESULT_FROM_WIN32(GetLastError());
        } catch(...) {return E_OUTOFMEMORY;}
    }
    HRESULT STDMETHODCALLTYPE GetFlags(EXPCMDFLAGS* flags) override {if(!flags)return E_POINTER;*flags=ECF_DEFAULT;return S_OK;}
    HRESULT STDMETHODCALLTYPE EnumSubCommands(IEnumExplorerCommand** commands) override {if(!commands)return E_POINTER;*commands=nullptr;return E_NOTIMPL;}
};

class shell_factory final: public IClassFactory {
    std::atomic<ULONG> references{1};
public:
    shell_factory(){++object_count;}
    ~shell_factory(){--object_count;}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void** output) override {
        if(!output)return E_POINTER;*output=nullptr;
        if(iid==IID_IUnknown||iid==IID_IClassFactory){*output=static_cast<IClassFactory*>(this);AddRef();return S_OK;}return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override {return ++references;}
    ULONG STDMETHODCALLTYPE Release() override {ULONG left=--references;if(!left)delete this;return left;}
    HRESULT STDMETHODCALLTYPE CreateInstance(IUnknown* outer,REFIID iid,void** output) override {
        if(!output)return E_POINTER;*output=nullptr;if(outer)return CLASS_E_NOAGGREGATION;
        auto command=new(std::nothrow) shell_command();if(!command)return E_OUTOFMEMORY;
        HRESULT result=command->QueryInterface(iid,output);command->Release();return result;
    }
    HRESULT STDMETHODCALLTYPE LockServer(BOOL lock) override {if(lock)++object_count;else --object_count;return S_OK;}
};

STDAPI DllGetClassObject(REFCLSID clsid,REFIID iid,void** output) {
    if(!output)return E_POINTER;*output=nullptr;if(clsid!=shell_clsid)return CLASS_E_CLASSNOTAVAILABLE;
    auto factory=new(std::nothrow) shell_factory();if(!factory)return E_OUTOFMEMORY;
    HRESULT result=factory->QueryInterface(iid,output);factory->Release();return result;
}
STDAPI DllCanUnloadNow(){return object_count==0?S_OK:S_FALSE;}

#ifdef TYPORA_SHELL_HOST
int WINAPI wWinMain(HINSTANCE,HINSTANCE,PWSTR,int) {
    try {
        auto executable=get_executable(true);
        if(executable.empty())executable=get_executable(false);
        if(executable.empty())return ERROR_FILE_NOT_FOUND;
        return reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr,L"open",executable.c_str(),nullptr,nullptr,SW_SHOWNORMAL))>32?0:1;
    } catch(...) {return ERROR_OUTOFMEMORY;}
}
#endif
