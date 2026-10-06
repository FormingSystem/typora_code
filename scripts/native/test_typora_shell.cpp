#include "typora_shell.cpp"
#include <cstdio>
#include <vector>

int wmain(int argc,wchar_t** argv) {
    if(argc>1) {
        CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
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
