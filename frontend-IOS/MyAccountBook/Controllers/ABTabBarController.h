//
//  ABTabBarController.h
//  MyAccountBook
//
//  主框架 —— 对齐前端 components/TabBar.vue 的 3 格结构：
//    流水 | 记一笔（中间凸起圆）| 报表
//  中间为「动作」而非视图，点击弹出记账（当前占位）。
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABTabBarController : UITabBarController
@end

NS_ASSUME_NONNULL_END
