---
uid: 4e3f253b
id: truman-town.town.facility.venue
parent: truman-town.town.facility
name: {zh: "场馆预约", en: "Venue Booking"}
description:
  zh: >
      预订与取消活动场馆。
      
  en: >
      Books and cancels event venues.
      
revision: e17e2c6652a39ef6b88d9f640adca34acd40c3a8
updated_at: "2026-09-28T09:01:56.839Z"
fingerprint: 13d97fe7649728fd32f57df3c7302698950a6638c2802dac493690e980ae52ed
source:
  - path: "src/town/facility/venue.js"
apis:
  - protocol: rpc
    path: "town.facility.venue.book"
    description:
      zh: >
          预订一个场馆（记录预订者、tick 区间与用途）。
          
      en: >
          Books a venue (records booker, tick window and purpose).
          
  - protocol: rpc
    path: "town.facility.venue.cancel"
    description:
      zh: >
          取消一个场馆预约。
          
      en: >
          Cancels a venue booking.
          
---
