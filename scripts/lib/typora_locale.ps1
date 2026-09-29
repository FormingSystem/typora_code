# Installer messages use an explicit process preference or the operating system UI language.
function get_typora_locale {
    $preference = [Environment]::GetEnvironmentVariable('TYPORA_CODE_LANGUAGE', 'Process')
    if ([string]::IsNullOrWhiteSpace($preference)) { $preference = [Globalization.CultureInfo]::CurrentUICulture.Name }
    if ($preference -match '^zh(?:-|_|$)') { return 'zh_cn' }
    return 'en'
}

function get_typora_text {
    param([Parameter(Mandatory=$true)][string]$key, [hashtable]$values=@{})
    if (-not (Get-Variable typora_install_messages -Scope Script -ErrorAction SilentlyContinue)) {
        $script:typora_install_messages = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'typora_messages.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
    }
    $entry = $script:typora_install_messages.PSObject.Properties[$key]
    if ($null -eq $entry) { throw "Unknown installer message: $key" }
    $text = [string]$entry.Value.(get_typora_locale)
    return [regex]::Replace($text, '\{([a-z][a-z0-9_]*)\}', {
        param($match)
        $name = $match.Groups[1].Value
        if ($values.ContainsKey($name)) { return [string]$values[$name] }
        return $match.Value
    })
}
