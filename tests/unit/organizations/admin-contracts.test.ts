import { expect, test } from "vitest";
import { memberInput, profileInput, transferInput } from "../../../src/modules/organizations/admin-contracts";
const requestId="12345678-1234-4234-8234-123456789abc";
const profile={requestId,version:1,name:"Equipo 🌎",timezone:"America/Lima"};
test("accepts Unicode without normalization and an explicit timezone",()=>expect(profileInput.parse(profile)).toEqual(profile));
for(const name of ["a\u0000b","a\ud800b","a\udc00b"]){test("rejects invalid PostgreSQL text "+JSON.stringify(name),()=>expect(profileInput.safeParse({...profile,name}).success).toBe(false));}
for(const extra of [{role:"owner"},{userId:"fake"},{slug:"changed"},{timezone:"invalid/timezone"},{version:0},{version:1.5}]){test("rejects forged or invalid profile "+JSON.stringify(extra),()=>expect(profileInput.safeParse({...profile,...extra}).success).toBe(false));}
test("member actions do not accept client identity or revoked timestamps",()=>{expect(memberInput.safeParse({requestId,version:1,action:"revoke",userId:"other"}).success).toBe(false);expect(memberInput.safeParse({requestId,version:1,action:"restore",revokedAt:null}).success).toBe(false);});
test("transfer requires both versions",()=>expect(transferInput.safeParse({requestId,targetMembershipId:requestId,targetVersion:1}).success).toBe(false));
