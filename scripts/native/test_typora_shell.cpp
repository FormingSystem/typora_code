#include "typora_shell.cpp"
#include <cstdio>
#include <vector>
#include <shlobj.h>

// Keep the real Windows folder view, with only its container service supplied by the test.
class test_site final: public IServiceProvider, public IShellBrowser {
public:
    ULONG references=1;
    ComPtr<IShellView> view;
    bool browser_only=false;
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void** output) override {
        if(!output)return E_POINTER;*output=nullptr;
        if(iid==IID_IUnknown||iid==IID_IServiceProvider)*output=static_cast<IServiceProvider*>(this);
        else if(iid==IID_IShellBrowser)*output=static_cast<IShellBrowser*>(this);
        else return E_NOINTERFACE;
        AddRef();return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override {return ++references;}
    ULONG STDMETHODCALLTYPE Release() override {return --references;}
    HRESULT STDMETHODCALLTYPE QueryService(REFGUID service,REFIID iid,void** output) override {
        *output=nullptr;
        if(service==SID_SFolderView&&!browser_only)return view->QueryInterface(iid,output);
        if(service==SID_STopLevelBrowser)return QueryInterface(iid,output);
        return E_NOINTERFACE;
    }
    HRESULT STDMETHODCALLTYPE QueryActiveShellView(IShellView** output) override {return view.CopyTo(output);}
    HRESULT STDMETHODCALLTYPE GetWindow(HWND*) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE ContextSensitiveHelp(BOOL) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE InsertMenusSB(HMENU,LPOLEMENUGROUPWIDTHS) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE SetMenuSB(HMENU,HOLEMENU,HWND) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE RemoveMenusSB(HMENU) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE SetStatusTextSB(LPCWSTR) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE EnableModelessSB(BOOL) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE TranslateAcceleratorSB(MSG*,WORD) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE BrowseObject(PCUIDLIST_RELATIVE,UINT) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE GetViewStateStream(DWORD,IStream**) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE GetControlWindow(UINT,HWND*) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE SendControlMsg(UINT,UINT,WPARAM,LPARAM,LRESULT*) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE OnViewWindowActive(IShellView*) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE SetToolbarItems(LPTBBUTTONSB,UINT,UINT) override {return E_NOTIMPL;}
};

class test_selection final: public IShellItemArray {
public:
    DWORD count=0;HRESULT result=S_OK;
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID,void**) override {return E_NOINTERFACE;}
    ULONG STDMETHODCALLTYPE AddRef() override {return 1;}
    ULONG STDMETHODCALLTYPE Release() override {return 1;}
    HRESULT STDMETHODCALLTYPE GetCount(DWORD* output) override {*output=count;return result;}
    HRESULT STDMETHODCALLTYPE GetItemAt(DWORD,IShellItem**) override {return E_UNEXPECTED;}
    HRESULT STDMETHODCALLTYPE BindToHandler(IBindCtx*,REFGUID,REFIID,void**) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE GetPropertyStore(GETPROPERTYSTOREFLAGS,REFIID,void**) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE GetPropertyDescriptionList(REFPROPERTYKEY,REFIID,void**) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE GetAttributes(SIATTRIBFLAGS,SFGAOF,SFGAOF*) override {return E_NOTIMPL;}
    HRESULT STDMETHODCALLTYPE EnumItems(IEnumShellItems**) override {return E_NOTIMPL;}
};

static HRESULT make_view(IShellItem* item,test_site& site) {
    ComPtr<IShellFolder> folder;
    HRESULT result=item->BindToHandler(nullptr,BHID_SFObject,IID_PPV_ARGS(&folder));
    if(FAILED(result))return result;
    SFV_CREATE create={sizeof(create)};create.pshf=folder.Get();
    return SHCreateShellFolderView(&create,&site.view);
}

static int test_background(const wchar_t* target,bool invoke) {
    ComPtr<IShellItem> item;
    if(FAILED(SHCreateItemFromParsingName(target,nullptr,IID_PPV_ARGS(&item))))return 30;
    test_site site;
    if(FAILED(make_view(item.Get(),site)))return 31;
    ComPtr<IExplorerCommand> command;command.Attach(new shell_command());
    ComPtr<IObjectWithSite> owner;
    if(FAILED(command.As(&owner)))return 32;
    if(owner->GetSite(IID_IUnknown,nullptr)!=E_POINTER)return 33;
    ComPtr<IUnknown> queried;
    if(SUCCEEDED(owner->GetSite(IID_PPV_ARGS(&queried))))return 34;
    owner->SetSite(static_cast<IServiceProvider*>(&site));
    if(site.references!=2)return 35;
    if(FAILED(owner->GetSite(IID_PPV_ARGS(&queried))))return 36;
    queried.Reset();
    test_selection selection;
    for(int index=0;index<1000;++index){
        site.browser_only=index%2!=0;
        std::wstring actual;bool folder=false;
        if(FAILED(get_target(index%3?&selection:nullptr,static_cast<IServiceProvider*>(&site),actual,folder))||!folder||actual!=target)return 37;
        if(site.references!=2)return 38;
    }
    selection.count=2;
    std::wstring actual;bool folder=false;
    if(get_target(&selection,static_cast<IServiceProvider*>(&site),actual,folder)!=E_INVALIDARG)return 39;
    selection.count=0;selection.result=E_ACCESSDENIED;
    if(get_target(&selection,static_cast<IServiceProvider*>(&site),actual,folder)!=E_ACCESSDENIED)return 40;
    selection.result=S_OK;selection.count=1;
    if(get_target(&selection,static_cast<IServiceProvider*>(&site),actual,folder)!=E_UNEXPECTED)return 41;
    ComPtr<IShellItemArray> selected;
    if(FAILED(SHCreateShellItemArrayFromShellItem(item.Get(),IID_PPV_ARGS(&selected))))return 42;
    if(FAILED(get_target(selected.Get(),nullptr,actual,folder))||actual!=target)return 43;
    wchar_t executable[32768]={};GetModuleFileNameW(nullptr,executable,32768);
    ComPtr<IShellItem> file_item;ComPtr<IShellItemArray> file_items;
    if(FAILED(SHCreateItemFromParsingName(executable,nullptr,IID_PPV_ARGS(&file_item)))||FAILED(SHCreateShellItemArrayFromShellItem(file_item.Get(),IID_PPV_ARGS(&file_items))))return 52;
    if(FAILED(get_target(file_items.Get(),static_cast<IServiceProvider*>(&site),actual,folder))||folder||actual!=executable)return 53;
    owner->SetSite(static_cast<IServiceProvider*>(&site));
    if(site.references!=2)return 54;
    if(invoke){
        EXPCMDSTATE state=ECS_HIDDEN;
        if(FAILED(command->GetState(nullptr,FALSE,&state))||state!=ECS_ENABLED)return 44;
        if(FAILED(command->Invoke(nullptr,nullptr)))return 45;
    }
    test_site replacement;
    ComPtr<IShellItem> virtual_item;
    if(FAILED(SHGetKnownFolderItem(FOLDERID_ControlPanelFolder,KF_FLAG_DEFAULT,nullptr,IID_PPV_ARGS(&virtual_item)))||FAILED(make_view(virtual_item.Get(),replacement)))return 46;
    owner->SetSite(static_cast<IServiceProvider*>(&replacement));
    if(site.references!=1||replacement.references!=2)return 47;
    if(SUCCEEDED(command->Invoke(nullptr,nullptr)))return 48;
    EXPCMDSTATE state=ECS_ENABLED;
    if(FAILED(command->GetState(nullptr,FALSE,&state))||state!=ECS_HIDDEN)return 49;
    owner->SetSite(nullptr);
    if(replacement.references!=1||command->Invoke(nullptr,nullptr)!=E_INVALIDARG)return 50;
    selection.count=0;
    if(command->Invoke(&selection,nullptr)!=E_INVALIDARG)return 55;
    if(invoke){
        if(FAILED(command->GetState(&selection,FALSE,&state))||state!=ECS_ENABLED)return 56;
    }
    owner->SetSite(static_cast<IServiceProvider*>(&site));
    owner.Reset();command.Reset();
    if(site.references!=1)return 51;
    printf("PASS: 1000 background resolutions through real Shell folder views; null/empty selections, service/browser routes, invalid inputs, virtual folders and site lifetimes.\n");
    return 0;
}

int wmain(int argc,wchar_t** argv) {
    if(argc>1) {
        CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
        if(wcscmp(argv[1],L"--background")==0&&argc>2){int result=test_background(argv[2],argc>3);CoUninitialize();if(result)printf("background failure=%d\n",result);return result;}
        IExplorerCommand* command=nullptr;
        HRESULT result=CoCreateInstance(shell_clsid,nullptr,CLSCTX_LOCAL_SERVER,IID_PPV_ARGS(&command));
        if(FAILED(result)){printf("activation=%08lx\n",result);return 1;}
        IShellItem* item=nullptr;
        result=SHCreateItemFromParsingName(argv[1],nullptr,IID_PPV_ARGS(&item));
        if(FAILED(result))return 2;
        IShellItemArray* items=nullptr;
        result=SHCreateShellItemArrayFromShellItem(item,IID_PPV_ARGS(&items));item->Release();
        if(FAILED(result))return 3;
        EXPCMDSTATE state=ECS_HIDDEN;
        result=command->GetState(items,FALSE,&state);
        printf("state=%d result=%08lx\n",state,result);
        if(argc>2&&wcscmp(argv[2],L"invoke")==0){result=command->Invoke(items,nullptr);printf("invoke=%08lx\n",result);}
        items->Release();command->Release();CoUninitialize();return FAILED(result)?4:0;
    }
    const std::vector<std::wstring> values={L"",L"C:\\",L"C:\\space dir\\file.md",L"C:\\a&b\\\u4e2d\u6587.cpp",L"x\"y",L"x\\\"y",L"\\\\server\\folder\\"};
    for(int round=0;round<1000;++round){
        for(auto value:values){
            value+=std::wstring(round%9,L'\\');
            auto line=L"program "+quote_argument(value);int count=0;
            auto parsed=CommandLineToArgvW(line.c_str(),&count);
            if(!parsed||count!=2||value!=parsed[1])return 10;
            LocalFree(parsed);
        }
    }
    if(DllCanUnloadNow()!=S_OK)return 11;
    IClassFactory* factory=nullptr;
    if(FAILED(DllGetClassObject(shell_clsid,IID_IClassFactory,reinterpret_cast<void**>(&factory))))return 12;
    if(DllCanUnloadNow()!=S_FALSE)return 13;
    IExplorerCommand* command=nullptr;
    if(FAILED(factory->CreateInstance(nullptr,IID_PPV_ARGS(&command))))return 14;
    EXPCMDFLAGS flags;
    if(command->GetFlags(&flags)!=S_OK||flags!=ECF_DEFAULT)return 15;
    if(command->Invoke(nullptr,nullptr)!=E_INVALIDARG)return 16;
    if(command->GetState(nullptr,FALSE,nullptr)!=E_POINTER)return 17;
    GUID name;
    if(command->GetCanonicalName(&name)!=S_OK||name!=shell_clsid)return 18;
    command->Release();factory->Release();
    if(DllCanUnloadNow()!=S_OK)return 19;
    printf("PASS: 7000 argument round trips; COM identity, lifetime and invalid-input contracts.\n");
    return 0;
}
