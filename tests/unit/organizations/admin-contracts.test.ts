import { expect, test } from "vitest";
import { memberInput, profileInput, transferInput } from "../../../src/modules/organizations/admin-contracts";
const requestId="12345678-1234-4234-8234-123456789abc";
const profile={requestId,version:1,name:"Equipo 🌎",timezone:"America/Lima"};
test("accepts Unicode without normalization and an explicit timezone",()=>expect(profileInput.parse(profile)).toEqual(profile));
for(const name of ["a\u0000b","a\ud800b","a\udc00b"]){test("rejects invalid PostgreSQL text "+JSON.stringify(name),()=>expect(profileInput.safeParse({...profile,name}).success).toBe(false));}
for(const extra of [{role:"owner"},{userId:"fake"},{slug:"changed"},{timezone:"invalid/timezone"},{version:0},{version:1.5}]){test("rejects forged or invalid profile "+JSON.stringify(extra),()=>expect(profileInput.safeParse({...profile,...extra}).success).toBe(false));}
test("member actions do not accept client identity or revoked timestamps",()=>{expect(memberInput.safeParse({requestId,version:1,action:"revoke",userId:"other"}).success).toBe(false);expect(memberInput.safeParse({requestId,version:1,action:"restore",revokedAt:null}).success).toBe(false);});
test("transfer requires both versions",()=>expect(transferInput.safeParse({requestId,targetMembershipId:requestId,targetVersion:1}).success).toBe(false));

const accept = (name: string) => profileInput.safeParse({ requestId, version: 1, name, timezone: "UTC" });
test("organization names keep accents, other scripts and compound emoji", () => {
  for (const name of ["Ñandú y Compañía", "Café Müller", "日本語チーム", "Привет, команда", "فريق المبيعات", "नमस्ते टीम", "می‌خواهم", "👨‍👩‍👧 Equipo", "Equipo 🌎", "Ab", "O'Brien & Co.", "  con espacios  "]) expect(accept(name).success, name).toBe(true);
  expect(accept("  con espacios  ").data?.name).toBe("con espacios");
});
test("organization names reject empty, invisible, control and bidirectional text", () => {
  const bad: [string, string][] = [["empty", ""], ["spaces", "    "], ["one letter", "a"], ["one emoji", "😀"], ["zero width spaces", "​​"], ["zwj only", "‍‍"], ["combining only", "́́"], ["variation selectors", "️️"], ["nbsp only", "  "],
    ["newline", "ab\ncd"], ["tab", "ab\tcd"], ["leading newline", "\nab"], ["nbsp at the edge", "ab "], ["bidi override", "ab‮cd"], ["bidi isolate", "ab⁦cd⁩"], ["rlm", "ab‏cd"], ["bom", "﻿ab"], ["soft hyphen", "a­b"], ["line separator", "ab cd"], ["C1 control", "ab\u0085cd"], ["DEL", "ab\u007fcd"], ["tag characters", "ab\u{e0041}"], ["NUL", "a\u0000b"], ["lone surrogate", "a\ud800b"], ["too long", "a".repeat(101)]];
  for (const [label, name] of bad) expect(accept(name).success, label).toBe(false);
  expect(accept("a".repeat(100)).success).toBe(true);
});
test("length is counted in code points, as in PostgreSQL", () => { expect(accept("😀😀").success).toBe(true); expect(accept("😀".repeat(100)).success).toBe(true); expect(accept("😀".repeat(101)).success).toBe(false); });
