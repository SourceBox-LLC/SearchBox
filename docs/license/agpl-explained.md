# License Explained

AGPL-3.0-or-later in plain English.

> **Navigation:** [Documentation](../README.md) > [License](README.md) > [AGPL Explained](agpl-explained.md)

---

## What is AGPL?

The **GNU Affero General Public License (AGPL)** is a free, copyleft license designed to ensure software remains free and open, even when run as a network service.

---

## Quick Summary

| Use Case | Allowed? | Requirements |
|----------|----------|--------------|
| **Personal use** | ✅ Yes | None |
| **Internal business use** | ✅ Yes | None |
| **Modify for personal use** | ✅ Yes | None |
| **Distribute modified version** | ✅ Yes | Provide source code |
| **Run as public web service** | ✅ Yes | Provide source to users |
| **Close source modifications** | ❌ No | N/A |
| **Use in proprietary software** | ❌ No | N/A |

---

## Your Rights

### ✅ You CAN

**Use SearchBox for any purpose:**
- Personal document search
- Internal business tool
- Research project
- Commercial product (with conditions)

**Study the source code:**
- Learn how it works
- Improve your programming skills
- Understand implementation details

**Modify the code:**
- Add features you need
- Fix bugs
- Optimize performance
- Customize for your use case

**Distribute copies:**
- Share with others
- Contribute improvements back
- Create derivative works (same license required)

**Run as a service:**
- Offer SearchBox as web service
- Charge for hosting
- Provide to customers (with source access)

---

## Your Obligations

### 📋 You MUST

**If you distribute or run as public service:**

| Obligation | What It Means |
|------------|---------------|
| **Provide source code** | Users must be able to access your modified source |
| **Keep license intact** | Include AGPL license in all copies |
| **Document changes** | Note what you modified and when |
| **Use same license** | Derivative works must also be AGPL |

**Source code access requires:**
- Providing download link
- Or sending on physical media (on request)
- Or embedding in the software

---

## What You Cannot Do

### ❌ You CANNOT

**Distribute without source:**
- Cannot distribute modified version without source
- Cannot sell modified version without providing source

**Close your modifications:**
- Cannot make modifications proprietary
- Cannot relicense as closed-source

**Remove license notices:**
- Must keep copyright notices
- Must keep AGPL license text
- Must keep attribution

**Add restrictions:**
- Cannot add use restrictions
- Cannot add field-of-use restrictions
- Cannot add geographical restrictions

---

## Common Scenarios

### Scenario 1: Personal Use

```
Use case: Installing SearchBox on your laptop for personal document search.
Requirement: None.
You can: Use, modify, keep changes private.
```

**Verdict:** ✅ No requirements. Use freely.

---

### Scenario 2: Internal Company Use

```
Use case: Installing SearchBox on company server for internal document search.
Requirement: None.
You can: Use, modify, keep changes private.
```

**Verdict:** ✅ No requirements. Internal use doesn't trigger AGPL.

---

### Scenario 3: Running Public Service

```
Use case: Offering SearchBox as public web service at search.mycompany.com.
Requirement: Provide source code to users.
You can: Charge for the service.
You must: Include source code link on the website.
```

**Verdict:** ✅ Allowed with source access requirement.

---

### Scenario 4: Distributing Modified Version

```
Use case: Forking SearchBox, adding features, and distributing the modified version.
Requirement: Provide source code under AGPL.
You can: Charge for distribution.
You must: Make source available, use AGPL license.
```

**Verdict:** ✅ Allowed with AGPL requirements.

---

### Scenario 5: Embedding in Proprietary Software

```
Use case: Incorporating SearchBox into your closed-source commercial product.
Requirement: Cannot do this.
Why: AGPL requires derivative works to be AGPL-licensed.
```

**Verdict:** ❌ Not allowed. Consider commercial license.

---

### Scenario 6: Hosting for Client

```
Use case: Hosting modified SearchBox for a client who accesses it remotely.
Requirement: Provide source code to the client.
You can: Charge for hosting and modifications.
You must: Give client access to modified source code.
```

**Verdict:** ✅ Allowed with source access to client.

---

## AGPL vs Other Licenses

| License | Can Close Source? | Must Share Modifications? | SaaS Loophole? |
|---------|------------------|---------------------------|----------------|
| **AGPL** | ❌ No | ✅ Yes | ✅ Closed |
| **GPL** | ❌ No | ✅ Yes (if distribute) | ❌ Open |
| **MIT** | ✅ Yes | ❌ No | ❌ Open |
| **Apache 2.0** | ✅ Yes | ❌ No | ❌ Open |

**Key difference:**
- **GPL**: Must share source only when distributing
- **AGPL**: Must share source even for network use
- **MIT/Apache**: No source sharing requirement

---

## SaaS Loophole

**The Problem:**
- GPL allows companies to use GPL software in SaaS without sharing modifications
- They run the software on their servers, users access via network
- GPL doesn't require source sharing for "network use"

**AGPL Closes This Loophole:**
- AGPL explicitly requires source sharing for network use
- Anyone offering AGPL software as a service must provide source
- Protects open-source from SaaS exploitation

---

## Why AGPL?

### Benefits

✅ **Protects open-source project:**
- Prevents companies from taking code without contributing back
- Forces improvements to be shared
- Ensures community benefits

✅ **Prevents exploitation:**
- Cannot make closed-source SaaS from AGPL code
- Cannot sell proprietary versions
- Cannot avoid giving back

✅ **Ensures fairness:**
- Everyone contributes improvements
- Community benefits from each other's work
- Maintainer can also offer commercial licenses

### Considerations

⚠️ **May limit adoption:**
- Companies may avoid AGPL for internal tools (incorrectly — internal use is fine)
- Some avoid due to compliance concerns
- Smaller ecosystem than MIT/Apache

⚠️ **Requires understanding:**
- Need to understand source sharing obligations
- May need legal review for commercial use
- Compliance can be complex

---

## Compliance Checklist

### If Distributing Modified Version

- [ ] Include original AGPL license text
- [ ] Include copyright notices
- [ ] Document your changes
- [ ] Provide source code download
- [ ] License under AGPL-3.0-or-later

### If Running as Public Service

- [ ] Make source code accessible to users
- [ ] Include license notice in user interface
- [ ] Provide source download link or embed in software
- [ ] Document modifications

### Internal Use Only

- [ ] None — AGPL doesn't apply to internal use

---

## Commercial License Alternative

Need to avoid AGPL requirements? We offer commercial licenses:

- **No source disclosure required**
- **Keep modifications private**
- **Use in proprietary software**
- **Priority support included**

**Contact:** [licensing@sourcebox.ai](mailto:licensing@sourcebox.ai)

See: [Commercial License](commercial.md)

---

## FAQ

**Q: Do I need to share my internal modifications?**

A: No. Internal use doesn't trigger AGPL requirements.

**Q: Can I sell a hosted version of SearchBox?**

A: Yes, but you must provide source code access to your users.

**Q: What counts as "distributing"?**

A: Sharing copies with others, whether for free or for money.

**Q: What counts as "public service"?**

A: Offering SearchBox as a web service accessible to external users.

**Q: Do I need a commercial license for internal business use?**

A: No. Internal use is free under AGPL.

**Q: Can I use SearchBox in my closed-source product?**

A: No. But you can purchase a commercial license.

---

## Full License Text

See [LICENSE](../../LICENSE) for complete AGPL-3.0-or-later text.

---

## Need Legal Advice?

This page is not legal advice. Consult a lawyer for:
- Commercial use questions
- Compliance concerns
- License compatibility issues
- Derivative works determinations

---

**Previous:** [License](README.md)  
**Next:** [Commercial License](commercial.md)