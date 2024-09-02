---
'@microlabs/otel-cf-workers': major
---

Breaking change in attribute names in aligning with incubating DB changes

- db.name -> db.namespace
- db.operation -> db.operation.name
- db.statememnt -> db.query.text
