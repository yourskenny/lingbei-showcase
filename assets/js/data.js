/* 最后一单 · 叙事数据
 * 所有人物、留言、对话为原创虚构；武汉地名真实，地图为示意。
 * 坐标基于 index.html 中 #cityMap 的 viewBox（1200 × 760）。
 */
window.LASTORDER = {
  version: 1,

  meta: {
    title: "最后一单",
    subtitle: "凌晨两点，武汉还没睡。",
    startTime: "00:47",
    endTime: "02:52",
    totalOrders: 3
  },

  /* 每一单：
   * from / pickup / drop 为地图坐标；approach 为“当前位置 → 取餐点”，
   * delivery 为“取餐点 → 送达点”。finale 只有 approach（回家）。
   */
  orders: [
    {
      id: "o1",
      no: "01",
      count: "1 / 3",
      time: "00:47",
      pickup: { name: "户部巷 · 老杨家热干面", short: "户部巷", x: 650, y: 472 },
      drop: { name: "武汉大学 · 枫园 6 栋", short: "武大枫园", x: 890, y: 512 },
      distance: "4.8",
      minutes: "18",
      fee: "8.5",
      approach: null,
      delivery: "M 650 472 C 700 486 760 496 812 506 S 866 512 890 512",
      customer: "林同学",
      note: "多放萝卜，不要葱。她今天面试没过，别问。",
      scene: {
        visual: "o1",
        time: "00:58",
        place: "武汉大学 · 枫园",
        weather: "雨刚停",
        narration: "宿舍楼下的铁门半开着。两个女生挤在一把伞下，接餐的那个把塑料袋往怀里拢了拢。",
        customerName: "林同学",
        customerLine: "“她今天面试没过。我给她点了碗热的，多放了萝卜。”",
        playerLine: "你把餐递过去。",
        choices: [
          {
            label: "说一句：会好的。",
            short: "会好的",
            outcome: "她愣了一下，点点头。你转身时，听见身后有人小声说：“谢谢啊。”"
          },
          {
            label: "把餐递过去，不打扰。",
            short: "不打扰",
            outcome: "你跨上车。骑出十几米，听见楼上有人喊：“师傅，路上慢点。”"
          }
        ],
        ticket: {
          no: "NO. 001",
          items: "热干面 ×1 / 蛋酒 ×1",
          note: "多放萝卜，不要葱。她今天面试没过，别问。",
          stamp: "已送达",
          place: "武大枫园",
          time: "00:58"
        },
        after: "下一单在粮道街。"
      }
    },
    {
      id: "o2",
      no: "02",
      count: "2 / 3",
      time: "01:18",
      pickup: { name: "粮道街 · 老周烧烤", short: "粮道街", x: 720, y: 486 },
      drop: { name: "长江大桥 · 汉阳桥头", short: "汉阳桥头", x: 455, y: 552 },
      distance: "6.2",
      minutes: "24",
      fee: "12.0",
      approach: "M 890 512 C 846 502 800 494 760 490 S 730 487 720 486",
      delivery: "M 720 486 C 688 480 652 468 628 474 C 616 486 614 494 612 500 C 570 520 500 542 455 552",
      customer: "陈师傅",
      note: "20 串微辣，给兄弟们。多带两双筷子。",
      scene: {
        visual: "o2",
        time: "01:37",
        place: "长江大桥 · 汉阳桥头",
        weather: "江风",
        narration: "桥下的灯柱旁停着几辆折叠电动车。三个代驾司机蹲在路边，把烧烤摊在引擎盖上。",
        customerName: "陈师傅",
        customerLine: "“这么晚还跑？来，喝口水。”",
        playerLine: "你把两袋烧烤放在他们中间。",
        choices: [
          {
            label: "坐下来，喝口水。",
            short: "喝口水",
            outcome: "你蹲了五分钟。桥上的车灯一辆接一辆，像一条不会停的河。陈师傅说，他跑完这单也回家了。"
          },
          {
            label: "还有一单，先走。",
            short: "先走",
            outcome: "他把一瓶水塞进你的车筐：“拿着。夜里口干。”"
          }
        ],
        ticket: {
          no: "NO. 002",
          items: "烧烤 ×20 / 冰水 ×1",
          note: "20 串微辣，给兄弟们。多带两双筷子。",
          stamp: "已送达",
          place: "汉阳桥头",
          time: "01:37"
        },
        after: "手机又响了：归元寺的藕汤。备注只有一句——敲门轻一点。"
      }
    },
    {
      id: "o3",
      no: "03",
      count: "3 / 3",
      time: "02:03",
      pickup: { name: "归元寺 · 巷口藕汤", short: "归元寺", x: 330, y: 620 },
      drop: { name: "粮道街 · 三单元 302", short: "粮道街", x: 720, y: 486 },
      distance: "6.8",
      minutes: "27",
      fee: "11.0",
      approach: "M 455 552 C 430 570 390 600 360 616 L 330 620",
      delivery: "M 330 620 C 390 610 440 590 470 566 C 520 540 580 520 612 500 C 640 492 690 490 720 486",
      customer: "周姐",
      note: "排骨藕汤，送到三楼。我妈睡着了，敲门轻一点。",
      scene: {
        visual: "o3",
        time: "02:19",
        place: "粮道街 · 三单元 302",
        weather: "楼道有风",
        narration: "楼道里只有一盏声控灯。你数着台阶上到三楼，门开了一条缝。她身上还穿着医院的外套。",
        customerName: "周姐",
        customerLine: "“我妈睡了。汤给我吧，谢谢你。”",
        playerLine: "你把砂锅递过去，盖子还是烫的。",
        choices: [
          {
            label: "帮她把门口的垃圾带下楼。",
            short: "带垃圾下楼",
            outcome: "她追到楼梯口，塞给你一个橘子。“拿着，甜。”"
          },
          {
            label: "说声辛苦，先走。",
            short: "说声辛苦",
            outcome: "她轻轻带上门。你听见门里有人问：“汤还热着？”她说：“热着。”"
          }
        ],
        ticket: {
          no: "NO. 003",
          items: "排骨藕汤 ×1（大份）",
          note: "排骨藕汤，送到三楼。我妈睡着了，敲门轻一点。",
          stamp: "已送达",
          place: "粮道街",
          time: "02:19"
        },
        after: "02:41，今日目标完成。你正准备收工，手机又亮了。"
      }
    }
  ],

  finale: {
    id: "o4",
    no: "04",
    count: "加单",
    time: "02:41",
    pickup: { name: "粮道街 · 你自己", short: "粮道街", x: 720, y: 486 },
    drop: { name: "积玉桥 · 四楼", short: "积玉桥", x: 682, y: 552 },
    distance: "1.7",
    minutes: "7",
    fee: "5.0",
    approach: "M 720 486 C 712 508 698 532 682 552",
    delivery: null,
    customer: "妈妈",
    note: "给我儿子。他跑夜班，别催他。",
    scene: {
      visual: "o4",
      time: "02:52",
      place: "积玉桥 · 老小区四楼",
      weather: "楼道灯坏了",
      narration: "你摸着黑上到四楼。门虚掩着，厨房的灯亮着。锅里的汤还在冒气。",
      customerName: "妈妈",
      customerLine: "“回来了？汤在锅里，还热着。”",
      playerLine: "你站在门口，没说话。",
      choices: [
        {
          label: "说：妈，我今天跑了四单。",
            short: "跑了四单",
            closing: "最后一单，是妈下的。",
          outcome: "她笑了：“晓得。最后一单，是我下的。”"
        },
        {
          label: "什么也不说，把汤端上桌。",
            short: "把汤端上桌",
            closing: "最后一单，是回家。",
          outcome: "她没问，只把筷子递给你。你看见她手背上新添的一道烫痕。"
        }
      ],
      ticket: {
        no: "NO. 004",
        items: "排骨藕汤 ×1（家里的碗）",
        note: "给我儿子。他跑夜班，别催他。",
        stamp: "回家",
        place: "积玉桥",
        time: "02:52"
      },
      after: "城市睡了，总有人醒着。"
    }
  },

  timeline: [
    { time: "00:47", place: "户部巷", line: "接单。手机电量 23%。" },
    { time: "00:58", place: "武大枫园", line: "热干面 ×1。雨刚停。" },
    { time: "01:37", place: "汉阳桥头", line: "烧烤 ×20。江风很大。" },
    { time: "02:19", place: "粮道街", line: "排骨藕汤 ×1。楼道很静。" },
    { time: "02:52", place: "积玉桥", line: "收工。汤还热着。" }
  ],

  summary: {
    kicker: "今夜收工",
    line: "城市睡了，总有人醒着。",
    subline: "最后一单，是回家。",
    totalOrders: "4",
    distance: "19.5",
    income: "36.5",
    endTime: "02:52"
  }
};
