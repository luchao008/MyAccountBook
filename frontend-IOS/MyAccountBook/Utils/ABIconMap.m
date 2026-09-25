//
//  ABIconMap.m
//  MyAccountBook
//

#import "ABIconMap.h"

@implementation ABIconMap

+ (NSDictionary<NSString *, NSString *> *)map {
    static NSDictionary *dict = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        dict = @{
        @"按揭还款": @"anjiehaikuan",
        @"保健费": @"baojianfei",
        @"保健品": @"baojianpin",
        @"保险报销": @"baoxianbaoxiao",
        @"柴米油盐蔬菜瓜果": @"chaimiyouyanshucaiguaguo",
        @"宠物宝贝": @"chongwubaobei",
        @"慈善捐助": @"cishanjuanzhu",
        @"打车租车": @"dachezuche",
        @"电脑": @"diannao",
        @"电影娱乐": @"dianyingyule",
        @"房租": @"fangzu",
        @"房租收入": @"fangzushouru",
        @"工资收入": @"gongzishouru",
        @"公共交通": @"gonggongjiaotong",
        @"公积金提款": @"gongjijintikuan",
        @"共享带宽收入": @"gongxiangdaikuanshouru",
        @"还人钱物": @"hairenqianwu",
        @"红包": @"hongbao",
        @"护肤品": @"hufupin",
        @"花草类": @"huacaolei",
        @"化妆饰品": @"huazhuangshipin",
        @"会员订阅": @"huiyuandingyue",
        @"火锅": @"huoguo",
        @"加班收入": @"jiabanshouru",
        @"家具": @"jiaju",
        @"家用电器": @"jiayongdianqi",
        @"兼职收入": @"jianzhishouru",
        @"健身卡": @"jianshenka",
        @"奖金收入": @"jiangjinshouru",
        @"教育学费": @"jiaoyuxuefei",
        @"经营所得": @"jingyingsuode",
        @"咖啡茶饮": @"kafeichayin",
        @"烂账损失": @"lanzhangsunshi",
        @"礼金收入": @"lijinshouru",
        @"理发": @"lifa",
        @"利息收入": @"lixishouru",
        @"利息支出": @"lixizhichu",
        @"旅游度假": @"lvyoudujia",
        @"美甲": @"meijia",
        @"美容费": @"meirongfei",
        @"奶茶": @"naicha",
        @"培训进修": @"peixunjinxiu",
        @"赔偿罚款": @"peichangfakuan",
        @"配件": @"peijian",
        @"朋友聚会": @"pengyoujuhui",
        @"其他": @"qita",
        @"其他饰品": @"qitashipin",
        @"其他支出": @"qitazhichu",
        @"汽车加油": @"qichejiayou",
        @"日常用品": @"richangyongpin",
        @"上网费": @"shangwangfei",
        @"烧烤": @"shaokao",
        @"食材采购": @"shicaicaigou",
        @"手机": @"shouji",
        @"手机费": @"shoujifei",
        @"书报杂志": @"shubaozazhi",
        @"数码产品": @"shumachanpin",
        @"数码装备": @"shumazhuangbei",
        @"水电煤气宽带": @"shuidianmeiqikuandai",
        @"水果零食": @"shuiguolingshi",
        @"顺风车": @"shunfengche",
        @"私家车费用": @"sijiachefeiyong",
        @"送礼请客": @"songliqingke",
        @"甜品": @"tianpin",
        @"投资亏损": @"touzikuisun",
        @"投资收入": @"touzishouru",
        @"外卖": @"waimai",
        @"晚餐": @"wancan",
        @"维修保养": @"weixiubaoyang",
        @"午餐": @"wucan",
        @"物品回收": @"wupinhuishou",
        @"物业管理": @"wuyeguanli",
        @"消费税收": @"xiaofeishuishou",
        @"孝敬家长": @"xiaojingjiazhang",
        @"鞋帽包包": @"xiemaobaobao",
        @"信用卡还款": @"xinyongkahaikuan",
        @"休闲玩乐": @"xiuxianwanle",
        @"烟酒茶": @"yanjiucha",
        @"药品费": @"yaopinfei",
        @"夜宵": @"yexiao",
        @"衣服裤子": @"yifukuzi",
        @"意外丢失": @"yiwaidiushi",
        @"意外来钱": @"yiwailaiqian",
        @"银行手续": @"yinhangshouxu",
        @"邮寄费": @"youjifei",
        @"游泳": @"youyong",
        @"瑜伽": @"yujia",
        @"运动健身": @"yundongjianshen",
        @"早餐": @"zaocan",
        @"早午晚餐": @"zaowuwancan",
        @"治疗费": @"zhiliaofei",
        @"中奖收入": @"zhongjiangshouru",
        @"座机费": @"zuojifei",
        @"AA还款": @"aahaikuan",
        };
    });
    return dict;
}

+ (NSString *)imageNameForCategory:(NSString *)categoryName {
    if (!categoryName.length) return nil;
    return [self map][categoryName];
}

+ (NSArray<NSString *> *)allCategoryNames {
    return [[self map].allKeys sortedArrayUsingSelector:@selector(compare:)];
}

@end
