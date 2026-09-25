//
//  ABTheme.m
//  MyAccountBook
//

#import "ABTheme.h"

@implementation ABTheme

+ (UIColor *)bgPage       { return ABColorHex(0xF8F8F8); }
+ (UIColor *)bgCard       { return ABColorHex(0xFFFFFF); }
+ (UIColor *)bgInset      { return ABColorHex(0xF5F5F5); }
+ (UIColor *)line         { return ABColorHex(0xF1F1F1); }
+ (UIColor *)lineStrong   { return ABColorHex(0xE5E5EA); }
+ (UIColor *)bgMask       { return [UIColor colorWithRed:0 green:0 blue:0 alpha:0.45]; }

+ (UIColor *)textPrimary   { return ABColorHex(0x222226); }
+ (UIColor *)textSecondary { return ABColorHex(0x6B6B72); }
+ (UIColor *)textTertiary  { return ABColorHex(0x9A9AA0); }
+ (UIColor *)textDisabled  { return ABColorHex(0xAEAEB2); }
+ (UIColor *)textInverse   { return UIColor.whiteColor; }

+ (UIColor *)goldFill    { return ABColorHex(0xE4AD77); }
+ (UIColor *)gold        { return ABColorHex(0xA85F12); }
+ (UIColor *)goldPressed { return ABColorHex(0x8F5312); }
+ (UIColor *)goldSoft    { return ABColorHex(0xFDF6EF); }
+ (UIColor *)heroInk     { return ABColorHex(0x8F5312); }

+ (UIColor *)income  { return ABColorHex(0xD92D20); }
+ (UIColor *)expense { return ABColorHex(0x0F7B7C); }
+ (UIColor *)info    { return ABColorHex(0x1D63B8); }
+ (UIColor *)danger  { return ABColorHex(0xD92D20); }
+ (UIColor *)warning { return ABColorHex(0xB45309); }

+ (UIFont *)fontDisplayLg { return [UIFont systemFontOfSize:36 weight:UIFontWeightSemibold]; }
+ (UIFont *)fontDisplay   { return [UIFont systemFontOfSize:28 weight:UIFontWeightSemibold]; }
+ (UIFont *)fontH1        { return [UIFont systemFontOfSize:20 weight:UIFontWeightSemibold]; }
+ (UIFont *)fontH2        { return [UIFont systemFontOfSize:17 weight:UIFontWeightMedium]; }
+ (UIFont *)fontBodyLg    { return [UIFont systemFontOfSize:16 weight:UIFontWeightRegular]; }
+ (UIFont *)fontBody      { return [UIFont systemFontOfSize:15 weight:UIFontWeightRegular]; }
+ (UIFont *)fontBodySm    { return [UIFont systemFontOfSize:14 weight:UIFontWeightRegular]; }
+ (UIFont *)fontCaption   { return [UIFont systemFontOfSize:12 weight:UIFontWeightRegular]; }

@end
