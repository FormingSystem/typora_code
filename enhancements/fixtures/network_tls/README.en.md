[Chinese](README.md)

<a id="section_648bb943ff36"></a>
# Local Network Test Certificate

These certificates and the public private keys of the public test servers are only for loopback address integration testing and not for production connections. The test CA private key has been discarded; the server SAN includes localhost and the GitHub domain simulated by the test, and the proxy only forwards to a temporary local server, never connecting to real GitHub. The certificate is valid until 2036, after which the test materials will be regenerated. Do not install it in the system trust store.
